import type { Leftover, VersionSummary } from '@dev-plumbing/core/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { api } from '../../api/client';
import { Button } from '../../components/Button';
import { Group } from '../../components/GroupedList';
import { formatUpdated } from '../../lib/time';

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/**
 * Where a version came from, in one line: when, the branch (and commit, when the clone had one), and what its merge
 * did, or that the draft started again from it. v1 is the import.
 */
export function versionMeta(v: VersionSummary): string {
  const source = v.commit ? `${v.branch} · ${v.commit.slice(0, 7)}` : v.branch;
  const merge = !v.merge
    ? 'Imported'
    : v.merge.fresh
      ? `Draft started from v${v.n}`
      : `${count(v.merge.clean, 'change')} merged · ${count(v.merge.conflicts, 'conflict')}`;
  return [formatUpdated(v.at), source, merge].join(' · ');
}

export function VersionsPage() {
  const { repo, project } = useParams({ from: '/p/$repo/$project/versions' });
  return <VersionsBody repo={repo} project={project} />;
}

/**
 * The folders updates that didn't finish left in docs/versions, each with Remove. Nothing removes them on its own: each
 * holds that version's plan and draft from before the update, the only copy of the draft as it was, until you say it
 * can go.
 */
function Leftovers({ repo, project, leftovers }: { repo: string; project: string; leftovers: Leftover[] }) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (name: string) => api.removeLeftover(repo, project, name),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['versions', repo, project] }),
  });
  return (
    <>
      <Group title="Left over from updates that didn't finish" testId="leftovers-list">
        {leftovers.map((l) => (
          <div key={l.name} className="flex items-center gap-2.5 px-3 py-2.5" data-testid="leftover-row">
            <div className="min-w-0 flex-1">
              <div className="break-all font-mono text-[12px]">{l.name}</div>
              <div className="text-[11.5px] text-ink-3">
                v{l.version}'s plan and draft from before the update · set aside {formatUpdated(l.at)}
              </div>
            </div>
            <Button
              size="sm"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`Remove ${l.name}? It holds your v${l.version} plan and draft from before an update that didn't finish. They're deleted.`)) remove.mutate(l.name);
              }}
            >
              Remove
            </Button>
          </div>
        ))}
      </Group>
      {remove.error && <p className="mt-2 text-[12.5px] text-seal">{(remove.error as Error).message}</p>}
    </>
  );
}

/** Every version of the plan, the current one first. Each opens that version's plan and draft. */
export function VersionsBody({ repo, project }: { repo: string; project: string }) {
  const q = useQuery({ queryKey: ['versions', repo, project], queryFn: () => api.versions(repo, project) });
  if (q.error) return <p className="text-[13px] text-seal">{(q.error as Error).message}</p>;
  if (!q.data) return <p className="text-[13px] text-ink-3">Loading…</p>;
  return (
    <div className="max-w-[80ch]">
      <h2 className="text-[20px] font-semibold">Versions</h2>
      <p className="mt-1 text-[12.5px] text-ink-3">Each time you bring the repo's changes in, the plan and the draft from before are kept here.</p>
      <Group testId="versions-list">
        {q.data.versions.map((v) => (
          <Link
            key={v.n}
            to="/p/$repo/$project/versions/$n"
            params={{ repo, project, n: String(v.n) }}
            className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-selection"
            data-testid="version-row"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[13px] font-medium">v{v.n}</span>
                {v.current && <span className="text-[10.5px] font-semibold text-ink-3">Current</span>}
              </div>
              <div className="break-words text-[11.5px] text-ink-3">{versionMeta(v)}</div>
            </div>
            <span className="text-ink-3">›</span>
          </Link>
        ))}
      </Group>
      {q.data.leftovers.length > 0 && <Leftovers repo={repo} project={project} leftovers={q.data.leftovers} />}
    </div>
  );
}
