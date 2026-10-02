import type { DisplayStatus } from '@dev-plumbing/core/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '../api/client';
import { AnswerForm } from '../components/AnswerForm';
import { Button } from '../components/Button';
import { StatusMark } from '../components/StatusMark';
import { ItemCard } from './ItemCard';
import { MessageList } from './MessageList';

const STATUS_TEXT: Record<DisplayStatus, string> = {
  your_turn: 'Your turn',
  draft: 'Draft, not sent',
  with_claude: 'With Claude',
  resolved: 'Resolved',
  parked: 'Parked',
  idle: 'Nothing needed',
};

export function ThreadView() {
  const { repo, project, thread } = useParams({ from: '/p/$repo/$project/th/$thread' });
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['thread', repo, project, thread], queryFn: () => api.thread(repo, project, thread) });
  const [notice, setNotice] = useState<string | null>(null);
  const unpark = useMutation({
    mutationFn: () => api.park(repo, project, thread, false),
    onSuccess: () => void qc.invalidateQueries({ predicate: (k) => k.queryKey[1] === repo && k.queryKey[2] === project }),
  });
  if (q.error) return <p className="text-[13px] text-seal">{(q.error as Error).message}</p>;
  if (!q.data) return <p className="text-[13px] text-ink-3">Loading…</p>;
  const d = q.data;
  const status = d.thread.display;

  return (
    <div className="max-w-3xl pb-28 md:pb-0" data-testid="thread-view">
      <Link to="/p/$repo/$project/t/$type" params={{ repo, project, type: d.type.id }} className="mb-2 inline-block text-[12.5px] text-slate">
        ‹ {d.type.title}
      </Link>
      <ItemCard detail={d} repo={repo} project={project} />
      <div className="mt-5 flex items-center gap-2">
        <StatusMark status={status} />
        <span className="text-[12px] text-ink-2" data-testid="thread-status">
          {STATUS_TEXT[status]}
        </span>
      </div>
      <MessageList detail={d} repo={repo} project={project} />
      {notice && (
        <p role="status" data-testid="send-notice" className="mt-3 text-[12.5px] text-ink-2">
          {notice}
        </p>
      )}
      <div className="mt-5">
        {status === 'with_claude' ? (
          <p className="text-[13px] text-ink-3">With Claude. A subagent is working on this thread.</p>
        ) : status === 'parked' ? (
          <Button onClick={() => unpark.mutate()}>Unpark</Button>
        ) : (
          <AnswerForm
            repo={repo}
            project={project}
            threadId={d.thread.id}
            open={d.open}
            presets={d.type.answerPresets}
            defaultValue={d.item.fields?.default}
            draft={d.thread.draft}
            previews={d.previews}
            canPark={status !== 'resolved'}
            onSent={(r) => setNotice(r.message)}
          />
        )}
      </div>
    </div>
  );
}
