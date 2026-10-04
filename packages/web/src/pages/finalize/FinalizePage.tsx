import type { ChecklistEntry, DisplayStatus, FinalizeChecklist, FinalizeView } from '@dev-plumbing/core/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { api } from '../../api/client';
import { Button } from '../../components/Button';
import { StatusMark } from '../../components/StatusMark';

const LIST = 'overflow-hidden rounded-[10px] border-[0.5px] border-separator bg-cell [&>*+*]:border-t-[0.5px] [&>*+*]:border-separator';
const WAITING = 'Waiting for Claude to write the final.';
const NO_WINDOW = 'No Claude window is listening. Run /dev-plumbing in any clone.';
const WRITING = 'Claude is writing the final.';
const GAVE_UP = "The finalizer didn't send a final.";

type Entry = ChecklistEntry & { defaultValue?: string };
type Group = { key: Exclude<keyof FinalizeChecklist, 'canStart'>; title: string; testId: string; tone: string };

/** The checklist's four lists, in order. Only the first stops Finalize; the last is a warning. */
const GROUPS: Group[] = [
  { key: 'blocking', title: 'These block Finalize', testId: 'checklist-blocking', tone: 'text-seal' },
  { key: 'defaults', title: 'These will use their default', testId: 'checklist-defaults', tone: 'text-ink-3' },
  { key: 'parked', title: 'Parked: left out of the final', testId: 'checklist-parked', tone: 'text-ink-3' },
  { key: 'unreviewed', title: 'Nobody has reviewed these', testId: 'checklist-unreviewed', tone: 'text-amber' },
];

/** One line on where the request is. Null when there's none, or when Claude's final is ready to review. */
function statusLine(v: FinalizeView): string | null {
  const r = v.request;
  if (r?.state === 'requested') return v.listening ? WAITING : NO_WINDOW;
  // The window that took it went away, and no other is running: it's requeued the moment one runs /dev-plumbing.
  if (r?.state === 'writing') return v.listening ? WRITING : NO_WINDOW;
  if (r?.state === 'failed') return r.reason ?? GAVE_UP;
  return null;
}

function ChecklistGroup({ group, entries, statusOf, repo, project }: { group: Group; entries: Entry[]; statusOf: (threadId: string) => DisplayStatus; repo: string; project: string }) {
  if (entries.length === 0) return null;
  return (
    <section className="mt-5" data-testid={group.testId}>
      <h3 className={`mb-1.5 ml-0.5 text-[12px] font-semibold ${group.tone}`}>{group.title}</h3>
      <div className={LIST}>
        {entries.map((e) => (
          // A thread can be listed twice, with two reasons.
          <Link
            key={`${e.threadId}:${e.reason}`}
            to="/p/$repo/$project/th/$thread"
            params={{ repo, project, thread: e.threadId }}
            className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-selection"
          >
            <StatusMark status={statusOf(e.threadId)} />
            <div className="min-w-0 flex-1">
              <div className="break-words text-[13px] font-medium">
                <span className="mr-1.5 text-[10.5px] font-semibold text-ink-3">{e.typeTitle}</span>
                {e.title}
              </div>
              <div className="text-[11.5px] text-ink-3">{e.defaultValue !== undefined ? `Default: ${e.defaultValue}` : e.reason}</div>
            </div>
            <span className="text-ink-3">›</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function FinalizePage() {
  const { repo, project } = useParams({ from: '/p/$repo/$project/finalize' });
  return <FinalizeBody repo={repo} project={project} />;
}

/** The Finalize page: where the request is, Start finalize, and the checklist. */
export function FinalizeBody({ repo, project }: { repo: string; project: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['finalize', repo, project], queryFn: () => api.finalize(repo, project) });
  // Already loaded by the project layout. The checklist's marks are the threads' statuses in the inbox.
  const home = useQuery({ queryKey: ['projectHome', repo, project], queryFn: () => api.projectHome(repo, project) });
  const start = useMutation({
    mutationFn: () => api.startFinalize(repo, project),
    onSettled: () => void qc.invalidateQueries({ predicate: (k) => k.queryKey[1] === repo && k.queryKey[2] === project }),
  });
  // A window that's alive but never comes back leaves the request on "writing", so there's a way out.
  const cancel = useMutation({
    mutationFn: () => api.discardProposal(repo, project),
    onSettled: () => void qc.invalidateQueries({ predicate: (k) => k.queryKey[1] === repo && k.queryKey[2] === project }),
  });
  if (q.error) return <p className="text-[13px] text-seal">{(q.error as Error).message}</p>;
  if (!q.data) return <p className="text-[13px] text-ink-3">Loading…</p>;
  const v = q.data;
  const { checklist } = v;
  const statuses = new Map((home.data?.inbox ?? []).map((e) => [e.threadId, e.status]));
  const statusOf = (threadId: string): DisplayStatus => statuses.get(threadId) ?? 'idle';
  const status = statusLine(v);
  const failed = v.request?.state === 'failed';
  // Start is offered when nothing is under way: no request yet, the last one failed, or Claude's final can't be read.
  const canAsk = !v.request || failed || (v.request.state === 'proposed' && !v.proposal);
  const underWay = v.request?.state === 'requested' || v.request?.state === 'writing';
  const label = failed ? 'Try again' : v.final ? 'Finalize again' : 'Start finalize';

  return (
    <div className="max-w-[80ch]" data-testid="finalize">
      <h2 className="text-[20px] font-semibold">Finalize spec</h2>
      <p className="mt-1 text-[12.5px] text-ink-3">Claude writes the final spec from the draft and what you decided. You preview it before anything is saved.</p>
      {status && (
        <p role="status" data-testid="finalize-status" className={`mt-4 text-[13px] ${failed ? 'text-seal' : 'text-ink-2'}`}>
          {status}
        </p>
      )}
      {underWay && (
        <div className="mt-3">
          <Button size="sm" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            Cancel
          </Button>
          {cancel.error && (
            <p role="alert" className="mt-2 whitespace-pre-line text-[12.5px] text-seal">
              {(cancel.error as Error).message}
            </p>
          )}
        </div>
      )}
      {canAsk && (
        <div className="mt-4">
          <Button variant="primary" disabled={!checklist.canStart || start.isPending} onClick={() => start.mutate()}>
            {label}
          </Button>
        </div>
      )}
      {start.error && (
        <p role="alert" className="mt-2 whitespace-pre-line text-[12.5px] text-seal">
          {(start.error as Error).message}
        </p>
      )}
      <div data-testid="finalize-checklist" className="mt-2">
        {checklist.blocking.length === 0 && <p className="mt-5 text-[13px] text-ink-2">Nothing blocks Finalize.</p>}
        {GROUPS.map((g) => (
          <ChecklistGroup key={g.key} group={g} entries={checklist[g.key]} statusOf={statusOf} repo={repo} project={project} />
        ))}
      </div>
    </div>
  );
}
