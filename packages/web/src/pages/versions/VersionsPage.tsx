import type { VersionSummary } from '@dev-plumbing/core/schemas';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { api } from '../../api/client';
import { Group } from '../../components/GroupedList';
import { formatUpdated } from '../../lib/time';

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/**
 * Where a version came from, in one line: when, the branch (and commit, when the clone had one), and what its merge
 * did. v1 is the import.
 */
export function versionMeta(v: VersionSummary): string {
  const source = v.commit ? `${v.branch} · ${v.commit.slice(0, 7)}` : v.branch;
  const merge = v.merge ? `${count(v.merge.clean, 'change')} merged · ${count(v.merge.conflicts, 'conflict')}` : 'Imported';
  return [formatUpdated(v.at), source, merge].join(' · ');
}

export function VersionsPage() {
  const { repo, project } = useParams({ from: '/p/$repo/$project/versions' });
  return <VersionsBody repo={repo} project={project} />;
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
    </div>
  );
}
