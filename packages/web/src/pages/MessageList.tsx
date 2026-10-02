import type { ClaudeMessage, Message, ThreadDetail, YouMessage } from '@dev-plumbing/core/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../api/client';
import { formatUpdated } from '../lib/time';

const seconds = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));
const took = (s: number) => (s < 90 ? `${s} s` : `${Math.round(s / 60)} min`);

function EditLine({ repo, project, changeId, summary, state }: { repo: string; project: string; changeId: string; summary: string; state?: string }) {
  const qc = useQueryClient();
  const act = useMutation({
    mutationFn: (action: 'undo' | 'apply') => api.changeAction(repo, project, changeId, action),
    onSuccess: () => void qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === repo && q.queryKey[2] === project }),
  });
  return (
    <li className="text-[12px] text-ink-2">
      {state === 'pending' ? 'Small edit, not applied' : state === 'undone' ? 'Small edit, undone' : 'Already applied (small)'}: {summary}
      {state === 'applied' && (
        <button type="button" className="ml-2 text-slate" onClick={() => act.mutate('undo')}>
          Undo
        </button>
      )}
      {(state === 'pending' || state === 'undone') && (
        <button type="button" className="ml-2 text-slate" onClick={() => act.mutate('apply')}>
          Apply
        </button>
      )}
      {act.error && <span className="ml-2 text-seal">{(act.error as Error).message}</span>}
    </li>
  );
}

export function MessageList({ detail, repo, project }: { detail: ThreadDetail; repo: string; project: string }) {
  const messages = detail.thread.messages;
  const nextYou = (i: number) => messages.slice(i + 1).find((m): m is YouMessage => m.author === 'you');
  const nextClaude = (i: number) => messages.slice(i + 1).find((m): m is ClaudeMessage => m.author === 'claude');

  const claude = (m: ClaudeMessage, i: number) => {
    const isOpen = detail.open?.messageId === m.id;
    const chosen = nextYou(i);
    return (
      <div>
        <div className="text-[11.5px] text-ink-3">
          <span className="font-semibold text-ink-2">Claude</span> · {m.opening ? 'raised when the plan was imported' : formatUpdated(m.at)}
        </div>
        <div className="doc mt-0.5 text-[13.5px]">
          <Markdown remarkPlugins={[remarkGfm]}>{m.text}</Markdown>
        </div>
        {m.filesRead?.length ? (
          <details className="text-[12px] text-ink-3">
            <summary className="cursor-pointer">
              Read {m.filesRead.length} file{m.filesRead.length === 1 ? '' : 's'}
            </summary>
            <ul className="ml-4 font-mono text-[11.5px]">
              {m.filesRead.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </details>
        ) : null}
        {!isOpen && m.options?.length ? (
          <ul className="mt-1.5 flex flex-col gap-0.5 text-[12.5px]">
            {m.options.map((o) => (
              <li key={o.id} className={chosen?.optionId === o.id ? 'text-ink' : 'text-ink-3'}>
                {chosen?.optionId === o.id ? '● ' : '○ '}
                {o.label}
                {chosen?.optionId === o.id && chosen.note ? <span className="text-ink-2"> · “{chosen.note}”</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {m.smallEdits?.length ? (
          <ul className="mt-1.5">
            {m.smallEdits.map((e) => (
              <EditLine key={e.changeId} repo={repo} project={project} changeId={e.changeId} summary={e.summary} state={detail.edits[e.changeId]?.state} />
            ))}
          </ul>
        ) : null}
        {m.newItemIds?.map((id) => {
          const ref = detail.refs[id];
          return ref ? (
            <p key={id} className="mt-1 text-[12px] text-ink-2">
              New thread opened in {ref.typeTitle}:{' '}
              <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: ref.threadId }} className="text-slate">
                {ref.title}
              </Link>
            </p>
          ) : null;
        })}
        {m.impacts?.map((imp) => {
          const ref = detail.refs[imp.itemId];
          return ref ? (
            <p key={imp.itemId} className="mt-1 text-[12px] text-ink-2">
              Might affect: {ref.typeTitle} › {ref.title}. {imp.reason} It's marked "may need another look".
            </p>
          ) : null;
        })}
      </div>
    );
  };

  const you = (m: YouMessage, i: number) => {
    const reply = nextClaude(i);
    return (
      <div className="border-l-2 border-slate pl-3">
        <div className="text-[11.5px] text-ink-3">
          <span className="font-semibold text-ink-2">You</span> · {formatUpdated(m.at)}
        </div>
        {m.optionLabel && <p className="text-[13px]">You chose: {m.optionLabel}</p>}
        {m.note && <p className="text-[13px] text-ink-2">“{m.note}”</p>}
        {m.text && <p className="whitespace-pre-wrap text-[13px]">{m.text}</p>}
        <p className="mt-0.5 text-[11px] text-ink-3">
          {m.sentWith === 'all' ? 'sent with Submit all' : 'sent on its own'}
          {reply ? ` · answered in ${took(seconds(m.at, reply.at))}` : ''}
        </p>
      </div>
    );
  };

  const render = (m: Message, i: number) =>
    m.author === 'claude' ? claude(m, i) : m.author === 'you' ? you(m, i) : <p className="text-[11.5px] text-ink-3">{m.text}</p>;

  return (
    <ol className="mt-4 flex flex-col gap-4" data-testid="messages">
      {messages.map((m, i) => (
        <li key={m.id}>{render(m, i)}</li>
      ))}
    </ol>
  );
}
