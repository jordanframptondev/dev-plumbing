import { Link } from '@tanstack/react-router';

/**
 * An item whose data can't be drawn. The rest of the screen still draws; this says why, and keeps the raw data one click away.
 * Screens pass the item's title and thread; the thread view, which is already the item's thread, leaves both out.
 */
export function DataProblem({ title, problems, data, threadId, repo, project }: { title?: string; problems: string[]; data: unknown; threadId?: string; repo: string; project: string }) {
  const raw = data === null || data === undefined ? 'No data' : JSON.stringify(data, null, 2);
  return (
    <section aria-label={title} data-testid="data-problem" className="rounded-[10px] border-[0.5px] border-separator bg-cell px-4 py-3">
      {title && <h3 className="mb-1 text-[15px] font-semibold">{title}</h3>}
      <p className="text-[13px] text-ink-2">This item's drawing couldn't be shown</p>
      {problems.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px] text-ink-3">
          {problems.map((p, i) => (
            <li key={i} className="break-words">
              {p}
            </li>
          ))}
        </ul>
      )}
      <details className="mt-2 text-[12px]">
        <summary className="cursor-pointer text-ink-2">Raw data</summary>
        <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11.5px] text-ink-2">{raw}</pre>
      </details>
      {threadId && (
        <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: threadId }} className="mt-2 inline-block text-[12px] text-slate">
          Open thread →
        </Link>
      )}
    </section>
  );
}
