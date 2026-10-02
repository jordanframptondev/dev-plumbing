import type { TypeEntry } from '@dev-plumbing/core/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '../api/client';
import { Button } from '../components/Button';
import { inputClass } from '../components/inputClass';

/** + Question / + Concern / + Idea: a new item whose thread starts with your message, sent to Claude straight away. */
export function AddItemForm({ repo, project, type, onDone }: { repo: string; project: string; type: TypeEntry; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const add = useMutation({
    mutationFn: () => api.addItem(repo, project, { type: type.id, title, text }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === repo && q.queryKey[2] === project });
      void navigate({ to: '/p/$repo/$project/th/$thread', params: { repo, project, thread: r.threadId } });
    },
  });
  return (
    <form
      aria-label={`New ${type.addLabel ?? 'item'}`}
      className="mt-3 rounded-[10px] border-[0.5px] border-separator bg-cell p-3"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <label className="block text-[12.5px] text-ink-2">
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${inputClass} mt-1`} autoFocus />
      </label>
      <label className="mt-2 block text-[12.5px] text-ink-2">
        Your message
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className={`${inputClass} mt-1`} />
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
