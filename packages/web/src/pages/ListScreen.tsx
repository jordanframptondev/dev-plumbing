import type { DisplayStatus, SubmitResponse, TypeEntry, TypeItemRow } from '@dev-plumbing/core/schemas';
import { Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { AnswerForm } from '../components/AnswerForm';
import { Button } from '../components/Button';
import { Group } from '../components/GroupedList';
import { Segmented } from '../components/Segmented';
import { StatusMark } from '../components/StatusMark';
import { AddItemForm } from './AddItemForm';

type Filter = 'needs' | 'claude' | 'resolved' | 'all';
const STATUS_TEXT: Record<DisplayStatus, string> = { your_turn: 'your turn', draft: 'draft', with_claude: 'with Claude', resolved: 'resolved', parked: 'parked', idle: '' };
const RISK: Record<string, string> = { critical: 'text-seal', high: 'text-seal', medium: 'text-amber', low: 'text-ochre' };
const KNOWN = ['blocking', 'default', 'severity', 'likelihood', 'effort'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

function FieldTags({ row }: { row: TypeItemRow }) {
  const f = row.fields;
  const parts: ReactNode[] = [];
  if (f.blocking === 'false' && f.default) parts.push(<span key="default">not blocking · default {f.default}</span>);
  if (f.severity) {
    parts.push(
      <span key="severity" className={`font-semibold ${RISK[f.severity.toLowerCase()] ?? 'text-ink-3'}`}>
        {cap(f.severity)}
        {f.likelihood ? ` · ${f.likelihood.toLowerCase()}` : ''}
      </span>,
    );
  }
  if (f.effort) parts.push(<span key="effort">Effort {f.effort}</span>);
  for (const [k, v] of Object.entries(f)) if (!KNOWN.includes(k)) parts.push(<span key={k}>{k} {v}</span>);
  return parts.length ? <span className="flex flex-wrap gap-x-2 text-[11px] text-ink-3">{parts}</span> : null;
}

function ListRow({ row, type, repo, project, onSent }: { row: TypeItemRow; type: TypeEntry; repo: string; project: string; onSent: (r: SubmitResponse) => void }) {
  const thread = { to: '/p/$repo/$project/th/$thread', params: { repo, project, thread: row.threadId } } as const;
  if (row.status === 'resolved' || row.status === 'parked') {
    return (
      <Link {...thread} className="flex items-center gap-2 px-3 py-2 text-[13px] hover:bg-selection" data-testid="list-row">
        <span className="text-ink-3">▸</span>
        <span className="font-medium">{row.title}</span>
        {row.decision && <span className="min-w-0 truncate text-ink-2">→ {row.decision}</span>}
        <span className="ml-auto shrink-0">
          <StatusMark status={row.status} />
        </span>
      </Link>
    );
  }
  const answerable = row.status !== 'with_claude' && (row.open || type.answerPresets.length > 0 || row.messageCount > 0);
  return (
    <div className="px-3 py-3" data-testid="list-row">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <StatusMark status={row.status} />
        {row.blocking && <span className="text-[10.5px] font-semibold text-seal">BLOCKING</span>}
        <span className="text-[13.5px] font-semibold">{row.title}</span>
        <FieldTags row={row} />
        <span className="ml-auto text-[11.5px] text-ink-3">{STATUS_TEXT[row.status]}</span>
      </div>
      <p className="mt-0.5 text-[12px] text-ink-3">
        {row.summary}
        {row.flagged ? <span className="text-amber"> · may need another look</span> : null}
      </p>
      {row.latest && (
        <p className="mt-1.5 text-[12.5px] text-ink-2">
          <span className="text-[11px] font-semibold text-ink-3">{row.latest.author === 'claude' ? 'Claude' : row.latest.author === 'you' ? 'You' : ''} · </span>
          {row.latest.text}
        </p>
      )}
      {answerable && (
        <div className="mt-2">
          <AnswerForm repo={repo} project={project} threadId={row.threadId} open={row.open} presets={type.answerPresets} defaultValue={row.fields.default} draft={row.draft} compact onSent={onSent} />
        </div>
      )}
      {row.fields.blocking === 'false' && row.fields.default && <p className="mt-1 text-[11.5px] text-ink-3">If you don't answer, the plan uses {row.fields.default}.</p>}
      <Link {...thread} className="mt-1.5 inline-block text-[12px] text-slate">
        Open thread ({row.messageCount} message{row.messageCount === 1 ? '' : 's'}) →
      </Link>
    </div>
  );
}

export function ListScreen({ repo, project, data }: { repo: string; project: string; data: { type: TypeEntry; items: TypeItemRow[] } }) {
  const { type, items } = data;
  const needs = items.filter((i) => i.status === 'your_turn' || i.status === 'draft' || i.status === 'idle');
  const withClaude = items.filter((i) => i.status === 'with_claude');
  const done = items.filter((i) => i.status === 'resolved' || i.status === 'parked');
  const [filter, setFilter] = useState<Filter>(needs.length ? 'needs' : 'all');
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const shown = filter === 'needs' ? needs : filter === 'claude' ? withClaude : filter === 'resolved' ? done : items;
  const blockingOpen = items.filter((i) => i.blocking && i.status !== 'resolved' && i.status !== 'parked').length;

  return (
    <div>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-[20px] font-semibold">{type.title}</h2>
        <span className="text-[12px] text-ink-3">
          {items.length}
          {type.fields.includes('blocking') ? ` · ${blockingOpen} blocking open` : ''}
        </span>
        {type.addLabel && !adding && (
          <Button className="ml-auto" onClick={() => setAdding(true)}>
            + {type.addLabel}
          </Button>
        )}
      </header>
      {notice && (
        <p role="status" data-testid="send-notice" className="mt-3 text-[12.5px] text-ink-2">
          {notice}
        </p>
      )}
      {adding && <AddItemForm repo={repo} project={project} type={type} onDone={() => setAdding(false)} />}
      <div className="mt-3 max-w-lg">
        <Segmented<Filter>
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'needs', label: `Needs you · ${needs.length}` },
            { value: 'claude', label: `With Claude · ${withClaude.length}` },
            { value: 'resolved', label: `Resolved · ${done.length}` },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>
      {shown.length ? (
        <Group>
          {shown.map((row) => (
            <ListRow key={row.id} row={row} type={type} repo={repo} project={project} onSent={(r) => setNotice(r.message)} />
          ))}
        </Group>
      ) : (
        <p className="mt-6 text-[13px] text-ink-3">Nothing here.</p>
      )}
    </div>
  );
}
