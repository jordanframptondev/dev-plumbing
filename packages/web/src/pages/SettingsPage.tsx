import type { ConfigProblem, FieldSpec, RepoProfile } from '@dev-plumbing/core/schemas';
import { agentsFields, flatten, settingsFields, unflatten } from '@dev-plumbing/core/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { api, ApiError, type ConfigResponse } from '../api/client';
import { Button } from '../components/Button';
import { inputClass } from '../components/inputClass';
import { Segmented } from '../components/Segmented';
import { Switch } from '../components/Switch';
import { useConfig } from '../lib/useConfig';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const RESTART = 'Restart the service to use the new port: dev-plumbing stop, then dev-plumbing start.';

type Notice = { kind: 'ok' | 'error'; text: string };

/** A failure the server didn't explain field by field: a 500, a bad request, or no answer at all. */
const failureMessage = (e: unknown) => (e instanceof ApiError ? e.message : `Couldn't reach dev-plumbing (${(e as Error).message}).`);

export function SettingsPage() {
  const { data: config } = useConfig();
  const open = useMutation({ mutationFn: () => api.open({ target: 'config' }) });
  if (!config) return null;
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-4 md:px-6 md:pt-6">
      <Link to="/" className="text-[13px] text-slate">
        ‹ Plumbing projects
      </Link>
      <h1 className="mt-1 text-[26px] font-bold tracking-tight">Settings</h1>
      <p className="mt-1 text-[12.5px] text-ink-3">
        These are plain files in <span className="break-all font-mono">{config.dir}</span>. The README there explains each one.
      </p>
      <div className="mt-3">
        <Button size="sm" onClick={() => open.mutate()}>
          Open config folder
        </Button>
      </div>
      {config.problems.length > 0 && <Problems problems={config.problems} />}
      <FieldsForm title="General" file="settings.json" fields={settingsFields} values={flatten(config.settings)} pick={(c) => flatten(c.settings)} save={(v) => api.saveSettings(v)} />
      <FieldsForm title="Agents" file="agents.json" fields={agentsFields} values={flatten(config.agents)} pick={(c) => flatten(c.agents)} save={(v) => api.saveAgents(v)} />
      <section className="mt-8" aria-labelledby="repos-title">
        <h2 id="repos-title" className="text-[20px] font-semibold">
          Repos
        </h2>
        <p className="mt-1 text-[12.5px] text-ink-3">A repo profile is created the first time you run /dev-plumbing in a repo. Edit it here as JSON.</p>
        {config.repos.length === 0 ? <p className="mt-3 text-[13px] text-ink-3">No repo profiles yet.</p> : config.repos.map((r) => <RepoEditor key={r.name} repo={r} />)}
      </section>
    </div>
  );
}

function Problems({ problems }: { problems: ConfigProblem[] }) {
  return (
    <div className="mt-5" data-testid="config-problems">
      <h2 className="text-[12px] font-semibold text-seal">Problems in your config files</h2>
      <ul className="mt-1 space-y-1 text-[12.5px] text-ink-2">
        {problems.map((p, i) => (
          <li key={i}>
            <span className="font-mono">
              {p.file}
              {p.key ? ` · ${p.key}` : ''}
            </span>
            : {p.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function FieldsForm({
  title,
  file,
  fields,
  values,
  pick,
  save,
}: {
  title: string;
  file: 'settings.json' | 'agents.json';
  fields: readonly FieldSpec[];
  values: Record<string, unknown>;
  /** This form's values, from a fresh config. */
  pick: (config: ConfigResponse) => Record<string, unknown>;
  save: (value: unknown) => Promise<{ value: unknown; restartRequired?: boolean; loginItemError?: string }>;
}) {
  const qc = useQueryClient();
  const config = useConfig();
  const [draft, setDraft] = useState(values);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const valuesKey = JSON.stringify(values);
  useEffect(() => setDraft(values), [valuesKey]);

  const mutation = useMutation({
    mutationFn: () => save(unflatten(draft)),
    onSuccess: (r) => {
      setErrors({});
      if (r.loginItemError) setNotice({ kind: 'error', text: r.restartRequired ? `${r.loginItemError} ${RESTART}` : r.loginItemError });
      else setNotice({ kind: 'ok', text: r.restartRequired ? `Saved. ${RESTART}` : 'Saved.' });
      void qc.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (e) => {
      const list = ((e as ApiError).body as { errors?: { key: string; message: string }[] } | null)?.errors ?? [];
      setErrors(Object.fromEntries(list.map((x) => [x.key, x.message])));
      setNotice(list.length ? null : { kind: 'error', text: failureMessage(e) });
    },
  });
  const reset = useMutation({
    mutationFn: () => api.reset(file),
    onSuccess: async (r) => {
      setErrors({});
      setNotice(r.loginItemError ? { kind: 'error', text: r.loginItemError } : { kind: 'ok', text: 'Reset to default.' });
      // The file may already have had the defaults, so the values don't change and the effect above doesn't run. Set the form directly.
      const fresh = await config.refetch();
      if (fresh.data) setDraft(pick(fresh.data));
    },
    onError: (e) => setNotice({ kind: 'error', text: failureMessage(e) }),
  });

  const edit = (key: string, value: unknown) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setNotice(null);
    setErrors({});
  };

  const id = `${file.replace('.', '-')}-title`;
  return (
    <section className="mt-8" aria-labelledby={id}>
      <div className="flex items-baseline gap-2">
        <h2 id={id} className="text-[20px] font-semibold">
          {title}
        </h2>
        <span className="font-mono text-[11.5px] text-ink-3">{file}</span>
      </div>
      <div className="mt-3 overflow-hidden rounded-[10px] border-[0.5px] border-separator bg-cell">
        {fields.map((f) => (
          <FieldRow key={f.key} field={f} value={draft[f.key]} error={errors[f.key]} onChange={(v) => edit(f.key, v)} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          Save
        </Button>
        <Button
          onClick={() => {
            if (window.confirm(`Reset ${file} to its default?`)) reset.mutate();
          }}
        >
          Reset to default
        </Button>
        {notice?.kind === 'ok' && (
          <span role="status" className="text-[12.5px] text-moss">
            {notice.text}
          </span>
        )}
        {notice?.kind === 'error' && (
          <span role="alert" className="text-[12.5px] text-seal">
            {notice.text}
          </span>
        )}
      </div>
    </section>
  );
}

function FieldRow({ field, value, error, onChange }: { field: FieldSpec; value: unknown; error?: string; onChange: (v: unknown) => void }) {
  const id = `field-${field.key}`;
  let control;
  if (field.kind === 'boolean') control = <Switch id={id} checked={Boolean(value)} onChange={onChange} label={field.label} />;
  else if (field.kind === 'enum' && field.options.length <= 3)
    control = <Segmented label={field.label} value={String(value)} onChange={onChange} options={field.options.map((o) => ({ value: o, label: capitalize(o) }))} />;
  else if (field.kind === 'enum')
    control = (
      <select id={id} value={String(value)} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  else if (field.kind === 'number')
    control = <input id={id} type="number" min={field.min} max={field.max} value={String(value ?? '')} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} className={inputClass} />;
  else control = <input id={id} type="text" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} className={`${inputClass} ${field.format === 'path' ? 'font-mono' : ''}`} />;

  return (
    <div className="flex flex-col gap-1.5 border-b-[0.5px] border-separator px-4 py-3 last:border-b-0 md:flex-row md:items-start md:gap-6">
      <div className="md:w-1/2">
        <label htmlFor={id} className="text-[13.5px] font-medium">
          {field.label}
        </label>
        <p className="mt-0.5 text-[12px] text-ink-3">{field.description}</p>
        <p className="font-mono text-[10.5px] text-ink-3">{field.key}</p>
      </div>
      <div className="md:w-1/2">
        {control}
        {error && <p className="mt-1 text-[12px] text-seal">{error}</p>}
      </div>
    </div>
  );
}

function RepoEditor({ repo }: { repo: RepoProfile }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(JSON.stringify(repo, null, 2));
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        throw new Error(`That isn't valid JSON: ${(e as Error).message}`);
      }
      return api.saveRepo(repo.name, parsed);
    },
    onSuccess: () => {
      setError(null);
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['config'] });
    },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <div className="mt-3 overflow-hidden rounded-[10px] border-[0.5px] border-separator bg-cell">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold">{repo.name}</div>
          <div className="truncate font-mono text-[11.5px] text-ink-3">
            {repo.match.join(', ')}
            {repo.projectsFolder ? ` → ${repo.projectsFolder}` : ''}
          </div>
        </div>
        <Button size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Close' : 'Edit'}
        </Button>
      </div>
      {open && (
        <div className="border-t-[0.5px] border-separator p-3">
          <textarea aria-label={`${repo.name} profile`} value={text} onChange={(e) => setText(e.target.value)} rows={14} spellCheck={false} className={`${inputClass} font-mono text-[12px]`} />
          {error && <p className="mt-1 text-[12px] text-seal">{error}</p>}
          <div className="mt-2">
            <Button size="sm" onClick={() => save.mutate()}>
              Save profile
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
