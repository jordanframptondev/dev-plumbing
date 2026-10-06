import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../../api/client';
import { DiffView } from '../../components/DiffView';
import { inputClass } from '../../components/inputClass';
import { Segmented } from '../../components/Segmented';
import { MARKDOWN_COMPONENTS } from '../finalize/ProposalView';
import { versionMeta } from './VersionsPage';

type Which = 'original' | 'draft';

export function VersionPage() {
  const { repo, project, n } = useParams({ from: '/p/$repo/$project/versions/$n' });
  // Keyed by version, so Plan | Draft and Compare with start afresh on each one.
  return <VersionBody key={n} repo={repo} project={project} n={Number(n)} />;
}

/** One version of the plan: its plan or its draft, and its plan compared with another version's. */
export function VersionBody({ repo, project, n }: { repo: string; project: string; n: number }) {
  const [which, setWhich] = useState<Which>('original');
  const [picked, setPicked] = useState<number | null>(null);
  const list = useQuery({ queryKey: ['versions', repo, project], queryFn: () => api.versions(repo, project) });
  const doc = useQuery({ queryKey: ['versionDoc', repo, project, n, which], queryFn: () => api.versionDoc(repo, project, n, which) });
  const versions = list.data?.versions ?? [];
  const version = versions.find((v) => v.n === n);
  // Newest first, like the list. By default an older version is compared with the current one, and the current one
  // with the version before it.
  const others = versions.filter((v) => v.n !== n);
  const fallback = version?.current ? (others.find((v) => v.n < n) ?? others[0]) : (others.find((v) => v.current) ?? others[0]);
  const other = picked ?? fallback?.n ?? null;
  // The diff always runs from the older version to the newer one.
  const [from, to] = other === null ? [null, null] : other < n ? [other, n] : [n, other];
  const compare = useQuery({
    queryKey: ['versionCompare', repo, project, from, to],
    queryFn: () => api.compareVersions(repo, project, from!, to!, 'original'),
    enabled: from !== null && to !== null,
  });
  // A version an update brought in: what that update did to the draft. v1 is the import, so it has none.
  const updateDiff = useQuery({
    queryKey: ['versionUpdateDiff', repo, project, n],
    queryFn: () => api.updateDiff(repo, project, n),
    enabled: Boolean(version?.merge),
  });

  if (list.error) return <p className="text-[13px] text-seal">{(list.error as Error).message}</p>;
  if (!list.data) return <p className="text-[13px] text-ink-3">Loading…</p>;
  if (!version) return <p className="text-[13px] text-ink-3">This version doesn't exist.</p>;
  return (
    <div className="max-w-[80ch]">
      <Link to="/p/$repo/$project/versions" params={{ repo, project }} className="text-[12px] text-slate">
        ‹ Versions
      </Link>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-[20px] font-semibold">v{n}</h2>
        {version.current && <span className="text-[10.5px] font-semibold text-ink-3">Current</span>}
      </div>
      <p className="mt-0.5 break-words text-[12px] text-ink-3">{versionMeta(version)}</p>
      <div className="mt-4 max-w-xs">
        <Segmented<Which>
          label="Version document"
          value={which}
          onChange={setWhich}
          options={[
            { value: 'original', label: 'Plan' },
            { value: 'draft', label: 'Draft' },
          ]}
        />
      </div>
      {doc.error ? (
        <p className="mt-4 text-[13px] text-seal">{(doc.error as Error).message}</p>
      ) : !doc.data ? (
        <p className="mt-4 text-[13px] text-ink-3">Loading…</p>
      ) : doc.data.text === null ? (
        <p className="mt-4 text-[13px] text-ink-3">This document is missing.</p>
      ) : (
        <article className="doc mt-4 max-w-[72ch]" data-testid="version-doc">
          <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
            {doc.data.text}
          </Markdown>
        </article>
      )}
      {version.merge && (
        <section aria-label="Update" className="mt-8 border-t-[0.5px] border-separator pt-4">
          <h3 className="text-[12px] font-semibold text-ink-3">What the update changed in your draft</h3>
          <div data-testid="version-update-diff">
            {updateDiff.error ? (
              <p className="mt-1.5 text-[13px] text-seal">{(updateDiff.error as Error).message}</p>
            ) : !updateDiff.data ? null : updateDiff.data.segments.some((s) => s.kind !== 'same') ? (
              <DiffView segments={updateDiff.data.segments} />
            ) : (
              <p className="mt-1.5 text-[13px] text-ink-3">The update didn't change your draft.</p>
            )}
          </div>
        </section>
      )}
      {other !== null && (
        <section aria-label="Compare" className="mt-8 border-t-[0.5px] border-separator pt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <label htmlFor="compare-with" className="text-[12px] font-semibold text-ink-3">
              Compare with
            </label>
            <div className="w-full max-w-[200px]">
              <select id="compare-with" value={other} onChange={(e) => setPicked(Number(e.target.value))} className={inputClass}>
                {others.map((v) => (
                  <option key={v.n} value={v.n}>
                    {v.current ? `v${v.n} · Current` : `v${v.n}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="mt-2 text-[12px] text-ink-3">
            Changes to the plan from v{from} to v{to}
          </p>
          <div data-testid="version-compare">
            {compare.error ? (
              <p className="mt-1.5 text-[13px] text-seal">{(compare.error as Error).message}</p>
            ) : !compare.data ? null : compare.data.segments.some((s) => s.kind !== 'same') ? (
              <DiffView segments={compare.data.segments} />
            ) : (
              <p className="mt-1.5 text-[13px] text-ink-3">The two plans are the same.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
