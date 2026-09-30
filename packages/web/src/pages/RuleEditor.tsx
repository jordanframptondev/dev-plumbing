import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../api/client';
import { Button } from '../components/Button';
import { Segmented } from '../components/Segmented';

export function RuleEditorPage() {
  const { file } = useParams({ from: '/rules/$file' });
  return <Editor kind="rule" name={file} />;
}

export function OutputEditorPage() {
  const { name } = useParams({ from: '/rules/outputs/$name' });
  return <Editor kind="output" name={name} />;
}

function Editor({ kind, name }: { kind: 'rule' | 'output'; name: string }) {
  const qc = useQueryClient();
  const file = useQuery({ queryKey: [kind, name], queryFn: () => (kind === 'rule' ? api.rule(name) : api.output(name)) });
  const [text, setText] = useState<string | null>(null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (file.data) setText(file.data.text);
  }, [file.data?.text]);

  const save = useMutation({
    mutationFn: () => (kind === 'rule' ? api.saveRule(name, text ?? '') : api.saveOutput(name, text ?? '')),
    onSuccess: () => {
      setError(null);
      setNotice('Saved.');
      void qc.invalidateQueries();
    },
    onError: (e) => {
      setNotice(null);
      setError((e as Error).message);
    },
  });
  const reset = useMutation({
    mutationFn: () => api.reset(kind === 'rule' ? `plumbing/${name}` : `outputs/${name}`),
    onSuccess: () => {
      setError(null);
      setNotice('Reset to default.');
      void qc.invalidateQueries();
    },
  });

  if (file.error) return <p className="px-4 py-8 text-[13px] text-seal">{(file.error as Error).message}</p>;
  if (text === null) return null;
  const body = text.replace(/^---[\s\S]*?\n---\n?/, '');

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-4 md:px-6 md:pt-6">
      <Link to="/rules" className="text-[13px] text-slate">
        ‹ Plumbing rules
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="min-w-0 break-all font-mono text-[20px] font-semibold">{name}</h1>
        <div className="ml-auto w-44">
          <Segmented
            label="Mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'edit', label: 'Edit' },
              { value: 'preview', label: 'Preview' },
            ]}
          />
        </div>
      </div>
      {mode === 'edit' ? (
        <textarea
          aria-label={name}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          className="mt-3 h-[60vh] w-full rounded-[10px] border-[0.5px] border-separator bg-cell p-3 font-mono text-[12.5px] leading-relaxed text-ink focus:outline-2 focus:outline-slate"
        />
      ) : (
        <article className="doc mt-3 rounded-[10px] border-[0.5px] border-separator bg-cell p-4">
          <Markdown remarkPlugins={[remarkGfm]}>{body}</Markdown>
        </article>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[12.5px] text-seal">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
          Save
        </Button>
        {file.data?.hasDefault && (
          <Button
            onClick={() => {
              if (window.confirm(`Reset ${name} to its default?`)) reset.mutate();
            }}
          >
            Reset to default
          </Button>
        )}
        {notice && (
          <span role="status" className="text-[12.5px] text-moss">
            {notice}
          </span>
        )}
      </div>
    </div>
  );
}
