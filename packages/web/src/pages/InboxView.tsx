import type { DisplayStatus, InboxEntry } from '@dev-plumbing/core/schemas';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '../api/client';
import { Group } from '../components/GroupedList';
import { StatusMark } from '../components/StatusMark';

const WHO = { claude: 'Claude', you: 'You', system: '' } as const;

function InboxGroup({ title, entries, repo, project }: { title?: string; entries: InboxEntry[]; repo: string; project: string }) {
  if (entries.length === 0) return null;
  return (
    <Group title={title ? `${title} · ${entries.length}` : undefined}>
      {entries.map((e) => (
        <Link key={e.threadId} to="/p/$repo/$project/t/$type" params={{ repo, project, type: e.type }} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-selection" data-testid="inbox-row">
          <StatusMark status={e.status} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium">
              {e.blocking && <span className="mr-1.5 text-[10.5px] font-semibold text-seal">BLOCKING</span>}
              <span className="mr-1.5 text-[10.5px] font-semibold uppercase text-ink-3">{e.typeTitle}</span>
              {e.itemTitle}
            </div>
            {e.lastMessage && (
              <div className="truncate text-[11.5px] text-ink-3">
                {WHO[e.lastMessage.author]}: {e.lastMessage.text}
              </div>
            )}
          </div>
          <span className="text-ink-3">›</span>
        </Link>
      ))}
    </Group>
  );
}

export function InboxView() {
  const { repo, project } = useParams({ from: '/p/$repo/$project' });
  const { data } = useQuery({ queryKey: ['projectHome', repo, project], queryFn: () => api.projectHome(repo, project) });
  const [showDone, setShowDone] = useState(false);
  if (!data) return null;
  const by = (s: DisplayStatus) => data.inbox.filter((e) => e.status === s);
  const resolved = by('resolved');
  const parked = by('parked');
  return (
    <div data-testid="inbox">
      <InboxGroup title="Your turn" entries={by('your_turn')} repo={repo} project={project} />
      <InboxGroup title="Drafts, not sent" entries={by('draft')} repo={repo} project={project} />
      <InboxGroup title="With Claude" entries={by('with_claude')} repo={repo} project={project} />
      {resolved.length + parked.length > 0 && (
        <button type="button" className="mt-4 text-[12px] font-semibold text-ink-3" onClick={() => setShowDone((v) => !v)}>
          {showDone ? '▾' : '▸'} Resolved {resolved.length} · Parked {parked.length}
        </button>
      )}
      {showDone && <InboxGroup entries={[...resolved, ...parked]} repo={repo} project={project} />}
      {data.inbox.length === 0 && <p className="mt-6 text-[13px] text-ink-3">Nothing is waiting. Threads appear here once the plan is imported.</p>}
    </div>
  );
}
