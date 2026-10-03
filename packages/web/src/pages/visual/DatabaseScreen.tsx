import { migrationKindValues, type DataChecks, type DiagramData, type TableDiff, type TypeItemRow } from '@dev-plumbing/core/schemas';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Segmented } from '../../components/Segmented';
import { StatusMark } from '../../components/StatusMark';
import { DiagramView } from '../../diagram/DiagramView';
import { DataProblem } from './DataProblem';
import { OtherItems } from './OtherItems';
import { itemAnchorId, splitRows, useScrollToItem } from './rows';
import type { ScreenProps } from './VisualScreen';

type Field = TableDiff['fields'][number];
type MigrationKind = (typeof migrationKindValues)[number];

const PRISMA_SCALARS = new Set(['String', 'Boolean', 'Int', 'BigInt', 'Float', 'Decimal', 'DateTime', 'Json', 'Bytes']);

/** The model a field points at, or null. Enums look like models, so a field counts as a relation only when its type is
 *  another table on this screen, a list (`Order[]`), or comes with a matching foreign key (`customer Customer` + `customerId`). */
export function relationTarget(field: Field, table: TableDiff, models: Set<string>): string | null {
  const written = field.type.trim().split(/\s+/)[0] ?? '';
  const base = written.replace(/\?$/, '').replace(/\[\]$/, '');
  if (!/^[A-Z]\w*$/.test(base) || PRISMA_SCALARS.has(base)) return null;
  if (models.has(base) || written.endsWith('[]')) return base;
  return table.fields.some((f) => f.name === `${field.name}Id`) ? base : null;
}

/** The relationship strip: a box per table (removed ones marked), unchanged boxes for the models they point at, a line per relation. */
export function relationshipStrip(tables: TableDiff[]): DiagramData | null {
  const models = new Set(tables.map((t) => t.model));
  const nodes = new Map<string, DiagramData['nodes'][number]>();
  for (const t of tables) {
    if (nodes.has(t.model)) continue;
    nodes.set(t.model, { id: t.model, label: t.change === 'removed' ? `${t.model} (removed)` : t.model, status: t.change === 'new' ? 'new' : 'changed' });
  }
  const edges = new Map<string, DiagramData['edges'][number]>();
  const related = new Set<string>();
  for (const t of tables) {
    for (const f of t.fields) {
      if (f.change === 'removed') continue;
      const to = relationTarget(f, t, models);
      if (!to || to === t.model) continue;
      if (!models.has(to)) related.add(to);
      const id = `${t.model}.${f.name}`;
      if (!edges.has(id)) edges.set(id, { id, from: t.model, to, label: f.name });
    }
  }
  for (const m of [...related].sort()) nodes.set(m, { id: m, label: m, status: 'unchanged' });
  return nodes.size < 2 ? null : { kind: 'system', groups: [], nodes: [...nodes.values()], edges: [...edges.values()] };
}

/** The migration panel's one-word answer: destructive beats data risk beats a backfill; otherwise it's additive only. */
export function migrationHeadline(kinds: MigrationKind[]): { text: string; className: string } {
  if (kinds.includes('destructive')) return { text: 'Destructive', className: 'text-seal' };
  if (kinds.includes('data-risk')) return { text: 'Data risk', className: 'text-amber' };
  if (kinds.includes('backfill')) return { text: 'Additive, with a backfill', className: 'text-ink' };
  return { text: 'Additive only', className: 'text-moss' };
}

const KIND_LABEL: Record<MigrationKind, { text: string; className: string }> = {
  additive: { text: 'Additive', className: 'text-ink-3' },
  backfill: { text: 'Backfill', className: 'text-ink-3' },
  destructive: { text: 'Destructive', className: 'text-seal' },
  'data-risk': { text: 'Data risk', className: 'text-amber' },
  rollback: { text: 'Rollback', className: 'text-ink-3' },
};

function MigrationPanel({ tables }: { tables: TableDiff[] }) {
  const entries = tables.flatMap((t) => (t.migration ?? []).map((m) => ({ ...m, model: t.model })));
  const kinds = entries.map((e) => e.kind);
  const head = migrationHeadline(kinds);
  return (
    <section data-testid="migration-panel" aria-label="Migration" className="mt-4 rounded-[10px] border-[0.5px] border-separator bg-cell px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="text-[15px] font-semibold">Migration</h3>
        <span data-testid="migration-headline" className={`text-[13px] font-semibold ${head.className}`}>
          {head.text}
        </span>
      </div>
      {migrationKindValues.map((kind) => {
        const list = entries.filter((e) => e.kind === kind);
        if (!list.length) return null;
        return (
          <div key={kind} className="mt-2" data-testid={`migration-${kind}`}>
            <h4 className={`text-[12px] font-semibold ${KIND_LABEL[kind].className}`}>{KIND_LABEL[kind].text}</h4>
            <ul className="mt-0.5 space-y-0.5 text-[12.5px]">
              {list.map((e, i) => (
                <li key={i} className="break-words">
                  <span className="mr-1.5 font-mono text-[11.5px] text-ink-3">{e.model}</span>
                  {e.text}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {!kinds.includes('rollback') && <p className="mt-2 text-[12.5px] text-amber">No rollback described</p>}
    </section>
  );
}

const CHANGE_WORD: Record<TableDiff['change'], { text: string; className: string }> = {
  new: { text: 'New', className: 'text-moss' },
  changed: { text: 'Changed', className: 'text-amber' },
  removed: { text: 'Removed', className: 'text-seal' },
};
// §16: added / removed lines are moss / seal with + and −; changed is amber.
const FIELD_MARK: Record<Field['change'], { sign: string; className: string }> = {
  added: { sign: '+', className: 'text-moss' },
  changed: { sign: '~', className: 'text-amber' },
  removed: { sign: '−', className: 'text-seal' },
  unchanged: { sign: '', className: 'text-ink-3' },
};

function FieldRow({ field }: { field: Field }) {
  const mark = FIELD_MARK[field.change];
  return (
    <li data-testid="field-row" data-field={field.name} data-change={field.change} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1">
      <span aria-hidden="true" className={`w-3 shrink-0 font-mono text-[12px] ${mark.className}`}>
        {mark.sign}
      </span>
      <span className="sr-only">{field.change}</span>
      <span className={`break-all font-mono text-[12px] ${field.change === 'removed' ? 'text-seal' : 'text-ink'}`}>{field.name}</span>
      <span className="break-all font-mono text-[11.5px] text-ink-2">{field.type}</span>
      {field.default && <span className="text-[11.5px] text-ink-3">default {field.default}</span>}
      {field.note && <span className="min-w-0 text-[11.5px] text-ink-3">{field.note}</span>}
    </li>
  );
}

function TableChecks({ checks }: { checks: DataChecks | null }) {
  if (checks?.kind !== 'database') return null;
  if (!checks.checked) {
    return (
      <p data-testid="table-checks" className="mt-1.5 text-[12px] text-ink-3">
        <span className="font-medium">Not checked</span> · {checks.reason}
      </p>
    );
  }
  if (checks.warnings.length) {
    return (
      <ul data-testid="table-checks" className="mt-1.5 space-y-0.5 text-[12px] text-amber">
        {checks.warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    );
  }
  return (
    <p data-testid="table-checks" className="mt-1.5 text-[12px] text-ink-3">
      <span className="text-moss">✓</span> Checked against <span className="break-all font-mono text-[11.5px]">{checks.file}</span>
    </p>
  );
}

/**
 * One table's diff card: what changes, checked against the repo's schema, as rows (Visual) or as the schema diff (Prisma).
 * `row` adds the item's title, status and thread link; the thread view leaves it out.
 */
export function TableCard({ data, checks, row, repo, project }: { data: TableDiff; checks: DataChecks | null; row?: TypeItemRow; repo: string; project: string }) {
  const [view, setView] = useState<'visual' | 'prisma'>('visual');
  const [folded, setFolded] = useState(true);
  const changed = data.fields.filter((f) => f.change !== 'unchanged');
  const unchanged = data.fields.filter((f) => f.change === 'unchanged');
  const word = CHANGE_WORD[data.change];
  return (
    <article data-testid="table-card" data-model={data.model} aria-label={`Table ${data.model}`} className="min-w-0 rounded-[10px] border-[0.5px] border-separator bg-cell px-4 py-3">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="break-all font-mono text-[14px] font-semibold">{data.model}</h3>
        <span className={`text-[12px] font-semibold ${word.className}`}>{word.text}</span>
        {row && (
          <span className="ml-auto flex items-center gap-1.5 text-[12px]">
            <StatusMark status={row.status} />
            <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: row.threadId }} className="text-slate">
              Open thread
            </Link>
          </span>
        )}
      </header>
      {row && <p className="mt-0.5 text-[12.5px] text-ink-2">{row.title}</p>}
      <TableChecks checks={checks} />
      <div className="mt-2.5 max-w-[220px]">
        <Segmented<'visual' | 'prisma'>
          label={`Show ${data.model} as`}
          value={view}
          onChange={setView}
          options={[
            { value: 'visual', label: 'Visual' },
            { value: 'prisma', label: 'Prisma' },
          ]}
        />
      </div>
      {view === 'visual' ? (
        <div className="mt-2">
          {changed.length > 0 && (
            <ul className="divide-y-[0.5px] divide-separator">
              {changed.map((f) => (
                <FieldRow key={f.name} field={f} />
              ))}
            </ul>
          )}
          {unchanged.length > 0 && (
            <>
              <button type="button" aria-expanded={!folded} onClick={() => setFolded((v) => !v)} className="mt-1 text-[12px] text-slate">
                {folded ? '▸' : '▾'} {unchanged.length} unchanged field{unchanged.length === 1 ? '' : 's'}
              </button>
              {!folded && (
                <ul className="divide-y-[0.5px] divide-separator">
                  {unchanged.map((f) => (
                    <FieldRow key={f.name} field={f} />
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      ) : data.schemaDiff.trim() ? (
        <pre data-testid="schema-diff" className="mt-2 whitespace-pre-wrap break-all font-mono text-[11.5px] leading-[1.55]">
          {data.schemaDiff.split('\n').map((line, i) => (
            <span key={i} className={`block ${line.startsWith('+') ? 'text-moss' : line.startsWith('-') ? 'text-seal' : 'text-ink-2'}`}>
              {line || ' '}
            </span>
          ))}
        </pre>
      ) : (
        <p className="mt-2 text-[12px] text-ink-3">No schema diff.</p>
      )}
    </article>
  );
}

/** Database: how the tables relate, what the migration does, and one diff card per table. */
export function DatabaseScreen({ repo, project, data, item }: ScreenProps) {
  const { shown, anchored, other } = splitRows('database', data.items);
  const tables = shown.flatMap((s) => (s.ok ? [s.data] : []));
  const strip = relationshipStrip(tables);
  useScrollToItem(item);
  return (
    <div className="mt-4">
      {strip && (
        <section data-testid="relationship-strip" aria-label="Relationships">
          <h3 className="mb-1.5 text-[12px] font-semibold text-ink-3">Relationships</h3>
          <DiagramView data={strip} compact />
        </section>
      )}
      {tables.length > 0 && <MigrationPanel tables={tables} />}
      <div className="mt-4 grid grid-cols-1 gap-3 min-[1100px]:grid-cols-2">
        {shown.map((s) => (
          <div
            key={s.row.id}
            id={itemAnchorId(s.row.id)}
            data-selected={item === s.row.id ? 'true' : undefined}
            className={`min-w-0 scroll-mt-4 ${item === s.row.id ? 'rounded-[10px] outline outline-1 outline-offset-2 outline-slate' : ''}`}
          >
            {s.ok ? (
              <TableCard data={s.data} checks={s.row.checks} row={s.row} repo={repo} project={project} />
            ) : (
              <DataProblem title={s.row.title} problems={s.problems} data={s.row.data} threadId={s.row.threadId} repo={repo} project={project} />
            )}
          </div>
        ))}
      </div>
      <OtherItems rows={[...other, ...anchored]} repo={repo} project={project} title={shown.length ? 'Other items' : undefined} />
    </div>
  );
}
