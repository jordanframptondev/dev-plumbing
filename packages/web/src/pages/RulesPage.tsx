import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '../api/client';
import { Button } from '../components/Button';
import { Group } from '../components/GroupedList';
import { inputClass } from '../components/inputClass';

export function RulesPage() {
  const { data, error } = useQuery({ queryKey: ['rules'], queryFn: api.rules });
  const [adding, setAdding] = useState(false);
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-4 md:px-6 md:pt-6">
      <Link to="/" className="text-[13px] text-slate">
        ‹ Plumbing projects
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="text-[26px] font-bold tracking-tight">Plumbing rules</h1>
        <Button className="ml-auto" size="sm" onClick={() => setAdding(true)}>
          + Plumbing type
        </Button>
      </div>
      <p className="mt-1 text-[12.5px] text-ink-3">Each plumbing type is one Markdown file. The header sets how it shows; the body is the rules Claude follows.</p>
      {error && <p className="mt-4 text-[13px] text-seal">{(error as Error).message}</p>}
      {adding && <NewTypeForm onCancel={() => setAdding(false)} />}
      {data && (
        <>
          <Group title="Plumbing types">
            {data.types.map((t) => (
              <Link key={t.file} to="/rules/$file" params={{ file: t.file }} className="flex items-center gap-3 px-3 py-2.5 hover:bg-selection" data-testid="rule-row">
                <span className="w-5 shrink-0 text-right text-[12px] text-ink-3">{t.order}</span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{t.title}</span>
                {!t.enabled && <span className="text-[11px] text-ink-3">Off</span>}
                <span className="font-mono text-[11px] text-ink-3">{t.screen}</span>
                <span className="text-ink-3">›</span>
              </Link>
            ))}
          </Group>
          {data.broken.length > 0 && (
            <Group title="Files with problems">
              {data.broken.map((b) => (
                <Link key={b.file} to="/rules/$file" params={{ file: b.file }} className="block px-3 py-2.5 hover:bg-selection" data-testid="broken-rule">
                  <div className="font-mono text-[12.5px]">{b.file}</div>
                  <div className="text-[12px] text-seal">{b.error}</div>
                </Link>
              ))}
            </Group>
          )}
          <Group title="Output rules">
            {data.outputs.map((o) => (
              <Link key={o} to="/rules/outputs/$name" params={{ name: o }} className="flex items-center px-3 py-2.5 hover:bg-selection">
                <span className="flex-1 font-mono text-[13px]">{o}</span>
                <span className="text-ink-3">›</span>
              </Link>
            ))}
          </Group>
        </>
      )}
    </div>
  );
}

function NewTypeForm({ onCancel }: { onCancel: () => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [id, setId] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => api.createRule(id.trim(), title.trim()),
    onSuccess: (r) => {
      void qc.invalidateQueries();
      void navigate({ to: '/rules/$file', params: { file: r.file } });
    },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <form
      className="mt-4 rounded-[10px] border-[0.5px] border-separator bg-cell p-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <div className="flex flex-col gap-3 md:flex-row">
        <label className="flex-1 text-[12.5px] text-ink-2">
          Id
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="rollout" className={`${inputClass} mt-1 font-mono`} />
        </label>
        <label className="flex-1 text-[12.5px] text-ink-2">
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rollout" className={`${inputClass} mt-1`} />
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[12.5px] text-seal">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <Button variant="primary" type="submit">
          Create
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
