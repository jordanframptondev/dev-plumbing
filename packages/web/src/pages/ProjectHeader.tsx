import type { ProjectHome } from '@dev-plumbing/core/schemas';
import { useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { api } from '../api/client';
import { Button, buttonClass } from '../components/Button';
import { ListeningMark } from '../components/ListeningMark';
import { ProgressBar } from '../components/ProgressBar';
import { draftsLabel, type useSubmit } from '../lib/useSubmit';

/** Why Finalize spec is off: "1 item blocks Finalize". */
export const blockedReason = (n: number) => `${n} ${n === 1 ? 'item blocks' : 'items block'} Finalize`;

/**
 * Off while something blocks Finalize and none is under way. A request already made stays reachable, and so does the
 * page once the project has a final: its Next command and what changed since live there.
 */
const finalizeBlocked = (home: ProjectHome) => !home.finalize.canStart && home.finalize.state === null && !home.project.docs.exportedTo;

/**
 * Finalize spec (Finalize again once the project is Finalized) opens the Finalize page. While it's off, the reason
 * next to it is a quiet link to that page, which lists what blocks it.
 */
function FinalizeButton({ home, repo, project }: { home: ProjectHome; repo: string; project: string }) {
  const label = home.project.status === 'finalized' ? 'Finalize again' : 'Finalize spec';
  if (finalizeBlocked(home)) {
    const reason = blockedReason(home.finalize.blockingCount);
    return (
      <>
        <Button disabled title={reason}>
          {label}
        </Button>
        <Link to="/p/$repo/$project/finalize" params={{ repo, project }} className="self-center text-[12px] text-ink-3">
          {reason} ›
        </Link>
      </>
    );
  }
  return (
    <Link to="/p/$repo/$project/finalize" params={{ repo, project }} className={buttonClass()}>
      {label}
    </Link>
  );
}

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
          <FinalizeButton home={home} repo={repo} project={project} />
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
      {/* Phones hide the buttons above, so Finalize gets its own row, with the reason it's off spelled out. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 md:hidden">
        <FinalizeButton home={home} repo={repo} project={project} />
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
