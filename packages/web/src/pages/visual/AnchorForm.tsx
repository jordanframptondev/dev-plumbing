import type { Anchor } from '@dev-plumbing/core/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '../../api/client';
import { Button } from '../../components/Button';
import { inputClass } from '../../components/inputClass';

/** Ask about one box, element or step: a new item of the same plumbing type, anchored to that part, sent to Claude straight away. */
export function AnchorForm({ repo, project, type, anchor, onDone }: { repo: string; project: string; type: string; anchor: Anchor; onDone: () => void }) {
  const [title, setTitle] = useState(`About ${anchor.label}`.slice(0, 200));
  const [text, setText] = useState('');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const add = useMutation({
    mutationFn: () => api.addItem(repo, project, { type, title: title.trim(), text: text.trim(), anchor }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === repo && q.queryKey[2] === project });
      void navigate({ to: '/p/$repo/$project/th/$thread', params: { repo, project, thread: r.threadId } });
    },
  });
  return (
    <form
      aria-label={`Ask about ${anchor.label}`}
      data-testid="anchor-form"
      className="mt-3 rounded-[10px] border-[0.5px] border-separator bg-cell p-3"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <label className="block text-[12.5px] text-ink-2">
        Title
        <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className={`${inputClass} mt-1`} />
      </label>
      <label className="mt-2 block text-[12.5px] text-ink-2">
        Your message
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className={`${inputClass} mt-1`} autoFocus />
      </label>
      {add.error && (
        <p role="alert" className="mt-2 text-[12.5px] text-seal">
          {(add.error as Error).message}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <Button type="submit" disabled={!title.trim() || !text.trim() || add.isPending}>
          Add and send
        </Button>
        <Button onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}
