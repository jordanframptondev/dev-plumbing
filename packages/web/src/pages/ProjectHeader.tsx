import type { ProjectHome } from '@dev-plumbing/core/schemas';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api/client';
import { Button } from '../components/Button';
import { ListeningMark } from '../components/ListeningMark';
import { ProgressBar } from '../components/ProgressBar';
import { draftsLabel, type useSubmit } from '../lib/useSubmit';

export function ProjectHeader({ home, repo, project, submitAll, submitPrimary = true }: { home: ProjectHome; repo: string; project: string; submitAll: ReturnType<typeof useSubmit>; submitPrimary?: boolean }) {
  const s = home.summary;
  const src = home.project.source;
  const open = useMutation({ mutationFn: () => api.open({ target: 'source', repo, id: project }) });
  return (
    <header>
      <div className="flex flex-wrap items-start gap-3">
        <h1 className="min-w-0 flex-1 text-[26px] font-bold leading-8 tracking-tight">{home.project.title}</h1>
        <div className="hidden gap-2 md:flex">
          <Button disabled title="Whiteboard Defense arrives in a later update.">Whiteboard Defense</Button>
          <Button disabled title="Finalize spec arrives in a later update.">Finalize spec</Button>
          <Button variant={submitPrimary ? 'primary' : 'secondary'} disabled={!s.counts.drafts || submitAll.isPending} onClick={() => submitAll.mutate({ scope: 'all' })}>
            Submit all · {draftsLabel(s.counts.drafts)}
          </Button>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3" data-testid="project-source">
        <span>Source</span>
        <span className="break-all font-mono text-ink-2">{src.path}</span>
        <span className="break-all">
          {src.clone} @ {src.branch}
        </span>
        <button type="button" className="text-slate" onClick={() => open.mutate()}>
          Open file
        </button>
        {open.error && <span className="text-seal">{(open.error as Error).message}</span>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-ink-2">
        {s.counts.total > 0 && (
          <>
            <span className="shrink-0">
              {s.counts.resolved} of {s.counts.total} resolved
            </span>
            <div className="min-w-24 flex-1">
              <ProgressBar resolved={s.counts.resolved} total={s.counts.total} withClaude={s.counts.withClaude} />
            </div>
          </>
        )}
        <ListeningMark state={home.listening} />
      </div>
      {(submitAll.data || submitAll.error) && (
        <p role="status" data-testid="submit-notice" className={`mt-2 hidden md:block text-[12.5px] ${submitAll.error ? 'text-seal' : 'text-ink-2'}`}>
          {submitAll.error ? (submitAll.error as Error).message : submitAll.data?.message}
        </p>
      )}
    </header>
  );
}
