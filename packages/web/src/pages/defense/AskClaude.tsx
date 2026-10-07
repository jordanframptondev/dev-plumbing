import type { DefenseLink } from '@dev-plumbing/core/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '../../api/client';
import { Button } from '../../components/Button';
import { inputClass } from '../../components/inputClass';
import { StatusMark } from '../../components/StatusMark';

type Props = {
  repo: string;
  project: string;
  defenseId: string;
  kind: 'section' | 'question' | 'concern';
  /** The part: a section's id, or a question's or a concern's (q1, c1). */
  partRef: string;
  /** Every Defense thread asked about this defense. Only this part's are listed. */
  asked: DefenseLink[];
};

/**
 * Ask Claude about this, under one part of the defense: the threads already asked about it, and a form for a new
 * question. Send makes a Defense thread whose first message is your question, sends it to Claude, and opens it.
 */
export function AskClaude({ repo, project, defenseId, kind, partRef, asked }: Props) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const ask = useMutation({
    mutationFn: () => api.askAboutDefense(repo, project, { defenseId, kind, ref: partRef, question }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ predicate: (k) => k.queryKey[1] === repo && k.queryKey[2] === project });
      void navigate({ to: '/p/$repo/$project/th/$thread', params: { repo, project, thread: r.threadId } });
    },
  });
  const threads = asked.filter((l) => l.kind === kind && l.ref === partRef);

  return (
    <div className="mt-2">
      {threads.length > 0 && (
        <ul className="mb-1.5 flex flex-col gap-1">
          {threads.map((l) => (
            <li key={l.threadId}>
              <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: l.threadId }} className="inline-flex max-w-full items-center gap-2 text-[12.5px] text-ink-2">
                <StatusMark status={l.status} />
                <span className="min-w-0 break-words">{l.title}</span>
                <span className="text-ink-3">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <form
          aria-label="Ask Claude about this"
          className="mt-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (question.trim()) ask.mutate();
          }}
        >
          <label className="block text-[12.5px] text-ink-2">
            Your question
            <textarea
              data-testid="ask-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              placeholder="What do you want to ask?"
              className={`${inputClass} mt-1`}
              autoFocus
            />
          </label>
          {ask.error && (
            <p role="alert" className="mt-2 text-[12.5px] text-seal">
              {(ask.error as Error).message}
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <Button type="submit" data-testid="ask-send" disabled={!question.trim() || ask.isPending}>
              Send
            </Button>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <button type="button" data-testid="ask-claude" className="text-[12px] text-slate" onClick={() => setOpen(true)}>
          Ask Claude about this
        </button>
      )}
    </div>
  );
}
