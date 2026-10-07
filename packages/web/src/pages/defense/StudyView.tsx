import { DEFENSE_PARTS, DEFENSE_SECTIONS, parseData, SEVERITY_LABELS, type DefenseLink, type DefenseTable, type WhiteboardDefense } from '@dev-plumbing/core/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { MouseEvent, ReactNode } from 'react';
import { api } from '../../api/client';
import { DiagramView } from '../../diagram/DiagramView';
import { AskClaude } from './AskClaude';
import type { DefenseViewProps } from './DefensePage';
import { BasisLabel, severityClass } from './labels';

type Entry = { anchor: string; n: number; title: string };
type Section = WhiteboardDefense['sections'][number];
/** Where a part's links go, and the threads asked about and sent from this defense. */
type Ctx = { repo: string; project: string; defenseId: string; asked: DefenseLink[]; sent: DefenseLink[] };

const numberOf = (id: Section['id']) => DEFENSE_SECTIONS.find((s) => s.id === id)?.n ?? 0;

/** The 13 parts in order: prose sections 1–9, the questions (10), the concerns (11), the unknowns (12), the checklist (13). */
export function contents(d: WhiteboardDefense): Entry[] {
  const prose = d.sections.map((s) => ({ anchor: `defense-section-${s.id}`, n: numberOf(s.id), title: s.title }));
  const parts = [
    { anchor: 'defense-questions', ...DEFENSE_PARTS.questions },
    { anchor: 'defense-concerns', ...DEFENSE_PARTS.concerns },
    { anchor: 'defense-checklist', ...DEFENSE_PARTS.checklist },
  ];
  return [...prose, ...parts].sort((a, b) => a.n - b.n);
}

/** Scrolls to a part in place, so the page's address (and its ?mode) stays as it is. */
function jump(anchor: string) {
  return (e: MouseEvent) => {
    const target = document.getElementById(anchor);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

export function Contents({ defense }: { defense: WhiteboardDefense }) {
  return (
    <nav aria-label="Contents" className="mt-6">
      <p className="text-[12px] font-semibold text-ink-3">Contents</p>
      <ol className="mt-1.5 text-[13px] leading-6 md:columns-2">
        {contents(defense).map((e) => (
          <li key={e.anchor} className="break-inside-avoid">
            <a href={`#${e.anchor}`} onClick={jump(e.anchor)} className="text-slate">
              {e.n}. {e.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** One of the 13 parts: its numbered heading, then its content. The id is what Contents scrolls to. */
function Part({ anchor, n, title, children }: Entry & { children: ReactNode }) {
  return (
    <section id={anchor} data-testid={anchor} className="mt-9 scroll-mt-4">
      <h3 className="text-[17px] font-semibold">
        {n}. {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * Send to Questions (a claim marked Unknown or Verify before release) or Send to Concerns (a release concern). Once
 * it's sent, a link to that thread instead. Claude picks it up and suggests answers.
 */
function SendToPlumbing({ ctx, kind, partRef }: { ctx: Ctx; kind: 'claim' | 'concern'; partRef: string }) {
  const { repo, project, defenseId } = ctx;
  const qc = useQueryClient();
  const send = useMutation({
    mutationFn: () => api.sendFromDefense(repo, project, { defenseId, kind, ref: partRef }),
    onSuccess: () => void qc.invalidateQueries({ predicate: (k) => k.queryKey[1] === repo && k.queryKey[2] === project }),
  });
  const target = kind === 'claim' ? 'Questions' : 'Concerns';
  const sent = ctx.sent.find((l) => l.kind === kind && l.ref === partRef);
  return (
    <span className="ml-2 inline-flex flex-wrap items-baseline gap-x-2">
      {sent ? (
        <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: sent.threadId }} className="whitespace-nowrap text-[12px] text-slate">
          In {target} ›
        </Link>
      ) : (
        <button type="button" data-testid="send-to-plumbing" className="whitespace-nowrap text-[12px] text-slate disabled:opacity-40" disabled={send.isPending || send.isSuccess} onClick={() => send.mutate()}>
          Send to {target}
        </button>
      )}
      {send.data && (
        <span role="status" className="text-[12px] text-ink-3">
          {send.data.message}
        </span>
      )}
      {send.error && (
        <span role="alert" className="text-[12px] text-seal">
          {(send.error as Error).message}
        </span>
      )}
    </span>
  );
}

/** A table: a real one from 768 px, and one card per row on a phone, so nothing scrolls sideways. */
function TableView({ table }: { table: DefenseTable }) {
  return (
    <div className="mt-4" data-testid="defense-table">
      <p className="text-[12.5px] font-semibold">{table.title}</p>
      <table className="mt-1.5 hidden w-full table-fixed border-collapse text-[13px] md:table">
        <thead>
          <tr>
            {table.columns.map((c, i) => (
              <th key={i} className="border-b-[0.5px] border-separator px-2.5 py-1.5 text-left text-[11.5px] font-semibold text-ink-3">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, i) => (
                <td key={i} className="break-words border-b-[0.5px] border-separator px-2.5 py-1.5 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1.5 overflow-hidden rounded-[10px] border-[0.5px] border-separator bg-cell md:hidden [&>*+*]:border-t-[0.5px] [&>*+*]:border-separator">
        {table.rows.map((row, r) => (
          <dl key={r} className="px-3 py-2.5 text-[13px]">
            {row.map((cell, i) => (
              <div key={i} className="mt-1 first:mt-0">
                <dt className="text-[11px] font-semibold text-ink-3">{table.columns[i]}</dt>
                <dd className="break-words">{cell}</dd>
              </div>
            ))}
          </dl>
        ))}
      </div>
    </div>
  );
}

/**
 * The project's diagram item that section 2 names, drawn as its screen draws it, with a link there. Nothing when the
 * item no longer has a diagram to draw.
 */
function DiagramItem({ repo, project, itemId }: { repo: string; project: string; itemId: string }) {
  // Every item's thread is t-<item id>; its detail has the item's data and its type's screen.
  const threadId = `t-${itemId}`;
  const q = useQuery({ queryKey: ['thread', repo, project, threadId], queryFn: () => api.thread(repo, project, threadId) });
  if (!q.data || q.data.type.screen !== 'diagram') return null;
  const parsed = parseData('diagram', q.data.item.data);
  if (!parsed.ok) return null;
  return (
    <div className="mt-4" data-testid="defense-diagram-item">
      <DiagramView data={parsed.data} compact />
      <Link to="/p/$repo/$project/t/$type" params={{ repo, project, type: q.data.type.id }} search={{ item: itemId }} className="mt-1 inline-block text-[12px] text-slate">
        {q.data.item.title} ›
      </Link>
    </div>
  );
}

function ProseSection({ section, ctx }: { section: Section; ctx: Ctx }) {
  const s = section;
  return (
    <Part anchor={`defense-section-${s.id}`} n={numberOf(s.id)} title={s.title}>
      <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[14px] leading-relaxed">
        {s.claims.map((c, i) => (
          <li key={i} className="break-words">
            <span className="whitespace-pre-line">{c.text}</span> <BasisLabel basis={c.basis} />
            {(c.basis === 'unknown' || c.basis === 'verify') && <SendToPlumbing ctx={ctx} kind="claim" partRef={`${s.id}.${i}`} />}
          </li>
        ))}
      </ul>
      {s.tables.map((t, i) => (
        <TableView key={i} table={t} />
      ))}
      {s.diagramItemId && <DiagramItem repo={ctx.repo} project={ctx.project} itemId={s.diagramItemId} />}
      {s.diagram && (
        <pre data-testid="defense-diagram" className="mt-4 overflow-x-auto border-l-2 border-separator py-1 pl-3 font-mono text-[12.5px]">
          {s.diagram}
        </pre>
      )}
      <AskClaude repo={ctx.repo} project={ctx.project} defenseId={ctx.defenseId} kind="section" partRef={s.id} asked={ctx.asked} />
    </Part>
  );
}

/**
 * Study: the defense to read, in the order of the 13 sections. Every statement says how sure it is. Any part can be
 * asked about, and what's unknown or still to verify, and each release concern, can be sent to plumbing.
 */
export function StudyView({ view, repo, project }: DefenseViewProps) {
  const d = view.defense;
  const ctx: Ctx = { repo, project, defenseId: d.id, asked: view.asked, sent: view.sent };
  const ticks = new Set(view.practice?.ticks ?? []);
  const ticked = d.checklist.filter((k) => ticks.has(k.id)).length;
  const prose = (from: number, to: number) => d.sections.filter((s) => numberOf(s.id) >= from && numberOf(s.id) <= to).map((s) => <ProseSection key={s.id} section={s} ctx={ctx} />);

  return (
    <div className="max-w-[72ch]" data-testid="study">
      <Contents defense={d} />
      {prose(1, 9)}
      <Part anchor="defense-questions" {...DEFENSE_PARTS.questions}>
        {d.questions.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-3">No questions in this defense.</p>
        ) : (
          <ol className="mt-2 flex flex-col gap-4">
            {d.questions.map((q) => (
              <li key={q.id} className="break-words text-[14px] leading-relaxed">
                <p className="font-semibold">{q.q}</p>
                <p className="mt-0.5">
                  <span className="whitespace-pre-line">{q.a}</span> <BasisLabel basis={q.basis} />
                </p>
                <AskClaude repo={repo} project={project} defenseId={d.id} kind="question" partRef={q.id} asked={view.asked} />
              </li>
            ))}
          </ol>
        )}
      </Part>
      <Part anchor="defense-concerns" {...DEFENSE_PARTS.concerns}>
        {d.concerns.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-3">None.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-4">
            {d.concerns.map((c) => (
              <li key={c.id} className="break-words text-[14px] leading-relaxed">
                <span className={`mr-1.5 text-[11px] font-semibold ${severityClass(c.severity)}`}>{SEVERITY_LABELS[c.severity]}</span>
                <span className="whitespace-pre-line">{c.text}</span> <BasisLabel basis={c.basis} />
                <SendToPlumbing ctx={ctx} kind="concern" partRef={c.id} />
                <AskClaude repo={repo} project={project} defenseId={d.id} kind="concern" partRef={c.id} asked={view.asked} />
              </li>
            ))}
          </ul>
        )}
      </Part>
      {prose(12, 12)}
      <Part anchor="defense-checklist" {...DEFENSE_PARTS.checklist}>
        <p className="mt-1 text-[12px] text-ink-3">
          {ticked} of {d.checklist.length} ticked
        </p>
        <ul className="mt-2 flex flex-col gap-1.5 text-[14px]">
          {d.checklist.map((k) => (
            <li key={k.id} className="flex items-baseline gap-2.5">
              {ticks.has(k.id) ? (
                <span role="img" aria-label="Ticked" className="w-3 shrink-0 text-center text-[12px] font-bold text-moss">
                  ✓
                </span>
              ) : (
                <span role="img" aria-label="Not ticked" className="inline-block size-[9px] shrink-0 translate-y-[1px] rounded-full border-[1.5px] border-mist" />
              )}
              <span className="min-w-0 break-words">{k.text}</span>
            </li>
          ))}
        </ul>
      </Part>
    </div>
  );
}
