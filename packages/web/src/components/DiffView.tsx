import type { DiffSegment } from '@dev-plumbing/core/schemas';
import type { ReactNode } from 'react';

const linesOf = (text: string) => text.replace(/\n$/, '').split('\n');

function Unchanged({ text, context, first, last }: { text: string; context: number; first: boolean; last: boolean }) {
  const lines = linesOf(text);
  const head = first ? [] : lines.slice(0, context);
  const tail = last ? [] : lines.slice(Math.max(head.length, lines.length - context));
  const hidden = lines.length - head.length - tail.length;
  const row = (l: string, i: number) => (
    <div key={i} className="whitespace-pre-wrap break-words text-ink-3">
      {'  '}
      {l}
    </div>
  );
  if (hidden <= 1) return <>{lines.map(row)}</>;
  return (
    <>
      {head.map(row)}
      <div className="py-0.5 text-ink-3">… {hidden} unchanged lines</div>
      {tail.map(row)}
    </>
  );
}

/** A line diff: added lines in moss with +, removed in seal with −, long unchanged runs folded. */
export function DiffView({ segments, context = 2, renderChangedBy }: { segments: DiffSegment[]; context?: number; renderChangedBy?: (s: DiffSegment) => ReactNode }) {
  return (
    <div className="mt-1.5 overflow-x-auto font-mono text-[11.5px] leading-[1.55]" data-testid="diff">
      {segments.map((s, i) =>
        s.kind === 'same' ? (
          <Unchanged key={i} text={s.text} context={context} first={i === 0} last={i === segments.length - 1} />
        ) : (
          <div key={i} data-kind={s.kind} className={s.kind === 'added' ? 'text-moss' : 'text-seal'}>
            {linesOf(s.text).map((l, j) => (
              <div key={j} className="whitespace-pre-wrap break-words">
                {s.kind === 'added' ? '+ ' : '− '}
                {l}
              </div>
            ))}
            {renderChangedBy?.(s)}
          </div>
        ),
      )}
    </div>
  );
}
