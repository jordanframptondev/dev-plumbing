import { useQuery } from '@tanstack/react-query';
import { useParams, useSearch } from '@tanstack/react-router';
import { api } from '../api/client';
import { ListScreen } from './ListScreen';
import { VisualScreen } from './visual/VisualScreen';

export function TypeView() {
  const { repo, project, type } = useParams({ from: '/p/$repo/$project/t/$type' });
  const { item } = useSearch({ from: '/p/$repo/$project/t/$type' });
  const { data, error } = useQuery({ queryKey: ['typeItems', repo, project, type], queryFn: () => api.typeItems(repo, project, type) });
  if (error) return <p className="text-[13px] text-seal">{(error as Error).message}</p>;
  if (!data) return <p className="text-[13px] text-ink-3">Loading…</p>;
  if (data.type.noChanges && data.type.importFailed) {
    return (
      <div data-testid="import-failed" className="py-10 text-center">
        <h2 className="text-[20px] font-semibold">{data.type.title}: Didn't finish</h2>
        <p className="mt-2 text-[14px] text-ink-2">The importer didn't finish for this plumbing type.</p>
      </div>
    );
  }
  if (data.type.noChanges) {
    return (
      <div data-testid="no-changes" className="py-10 text-center">
        <h2 className="text-[20px] font-semibold">{data.type.title}: no changes</h2>
        <p className="mt-2 text-[14px] text-ink-2">{data.type.emptyMessage}</p>
        <p className="mt-1 text-[12.5px] text-ink-3">{data.type.noChanges.reason}</p>
      </div>
    );
  }
  if (data.type.screen === 'list') return <ListScreen key={type} repo={repo} project={project} data={data} />;
  return <VisualScreen key={type} repo={repo} project={project} data={data} item={item} />;
}
