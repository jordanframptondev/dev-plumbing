import type { ChangeState, DiffSegment } from '@dev-plumbing/core/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Fragment } from 'react';
import { api } from '../api/client';
import { DiffView } from '../components/DiffView';
import { Group, Row } from '../components/GroupedList';
import { formatUpdated } from '../lib/time';

const STATE: Record<ChangeState, string> = { applied: 'Applied', undone: 'Undone', pending: 'Not applied' };

/** The Draft against the original, each change linked to the thread that caused it, and every recorded change. */
export function ChangesView({ repo, project }: { repo: string; project: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['changes', repo, project], queryFn: () => api.changes(repo, project) });
  const act = useMutation({
    mutationFn: (v: { id: string; action: 'undo' | 'apply' }) => api.changeAction(repo, project, v.id, v.action),
    onSuccess: () => void qc.invalidateQueries({ predicate: (k) => k.queryKey[1] === repo && k.queryKey[2] === project }),
  });
  if (q.error) return <p className="text-[13px] text-seal">{(q.error as Error).message}</p>;
  if (!q.data) return <p className="text-[13px] text-ink-3">Loading…</p>;
  const { segments, entries } = q.data;

  const changedBy = (s: DiffSegment) =>
    s.changedBy?.length ? (
      <p className="font-sans text-[11.5px] text-ink-3">
        changed by:{' '}
        {s.changedBy.map((c, i) => (
          <Fragment key={c.changeId}>
            {i ? ', ' : ''}
            <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: c.threadId }} className="text-slate">
              {c.threadTitle}
            </Link>
          </Fragment>
        ))}
      </p>
    ) : null;

  return (
    <div data-testid="changes" className="max-w-[80ch]">
      {segments.some((s) => s.kind !== 'same') ? (
        <DiffView segments={segments} renderChangedBy={changedBy} />
      ) : (
        <p className="text-[13px] text-ink-3">The draft is the same as the original so far.</p>
      )}
      <Group title="Changes">
        {entries.length === 0 && <Row title={<span className="font-normal text-ink-3">No changes yet.</span>} />}
        {entries.map((e) => (
          <Row
            key={e.id}
            title={e.summary}
            meta={`${e.kind === 'accept' ? 'Accepted' : 'Small edit'} · ${STATE[e.state]} · ${formatUpdated(e.at)}`}
            trailing={
              <span className="flex shrink-0 items-center gap-3 text-[12px]">
                <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: e.threadId }} className="hidden text-slate md:inline">
                  {e.threadTitle}
                </Link>
                {e.kind === 'small-edit' && e.state === 'applied' && (
                  <button type="button" className="text-slate" disabled={act.isPending} onClick={() => act.mutate({ id: e.id, action: 'undo' })}>
                    Undo
                  </button>
                )}
                {e.kind === 'small-edit' && e.state !== 'applied' && (
                  <button type="button" className="text-slate" disabled={act.isPending} onClick={() => act.mutate({ id: e.id, action: 'apply' })}>
                    Apply
                  </button>
                )}
              </span>
            }
          />
        ))}
      </Group>
      {act.error && (
        <p role="alert" className="mt-2 text-[12.5px] text-seal">
          {(act.error as Error).message}
        </p>
      )}
    </div>
  );
}
