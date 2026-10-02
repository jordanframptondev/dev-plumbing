import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { api } from '../api/client';
import { Group, Row } from '../components/GroupedList';
import { StatusMark } from '../components/StatusMark';
import { ListScreen } from './ListScreen';

export function TypeView() {
  const { repo, project, type } = useParams({ from: '/p/$repo/$project/t/$type' });
  const { data, error } = useQuery({ queryKey: ['typeItems', repo, project, type], queryFn: () => api.typeItems(repo, project, type) });
  if (error) return <p className="text-[13px] text-seal">{(error as Error).message}</p>;
  if (!data) return null;
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
  return (
    <div>
      <h2 className="text-[20px] font-semibold">{data.type.title}</h2>
      <Group title={`${data.items.length} item${data.items.length === 1 ? '' : 's'}`}>
        {data.items.map((i) => (
          <Link key={i.id} to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: i.threadId }} className="block hover:bg-selection" data-testid="type-row">
            <Row
              leading={<StatusMark status={i.status} />}
              title={
                <>
                  {i.blocking && <span className="mr-1.5 text-[10.5px] font-semibold text-seal">BLOCKING</span>}
                  {i.title}
                </>
              }
              meta={i.summary}
            />
          </Link>
        ))}
      </Group>
    </div>
  );
}
