import type { ThreadDetail } from '@dev-plumbing/core/schemas';
import { Link } from '@tanstack/react-router';
import { Fragment, useState, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const SCREEN_NAMES = { diagram: 'diagram', database: 'database', mockups: 'mockup', flows: 'flow', list: 'list' } as const;

export function ItemCard({ detail, repo, project }: { detail: ThreadDetail; repo: string; project: string }) {
  const [open, setOpen] = useState(true);
  const item = detail.item;
  const fields = Object.entries(item.fields ?? {}).filter(([k]) => k !== 'blocking');
  const row = (label: string, value: ReactNode) => (
    <Fragment key={label}>
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0">{value}</dd>
    </Fragment>
  );
  return (
    <section aria-label="Item" className="rounded-[10px] border-[0.5px] border-separator bg-cell px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold text-ink-3">{detail.type.title}</div>
          <h1 className="text-[20px] font-semibold leading-tight">
            {item.fields?.blocking === 'true' && <span className="mr-2 align-middle text-[11px] font-semibold text-seal">BLOCKING</span>}
            {item.title}
          </h1>
          <p className="mt-0.5 text-[13px] text-ink-2">{item.summary}</p>
        </div>
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="shrink-0 text-[12px] text-slate">
          {open ? 'Collapse' : 'Expand'}
        </button>
      </div>
      {open && (
        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 text-[12.5px] md:grid-cols-[120px_1fr]">
          {fields.map(([k, v]) => row(k, v))}
          {item.body &&
            row(
              'Detail',
              <div className="doc text-[13px]">
                <Markdown remarkPlugins={[remarkGfm]}>{item.body}</Markdown>
              </div>,
            )}
          {item.mdAnchor &&
            row(
              'In the draft',
              <Link to="/p/$repo/$project/d/$doc" params={{ repo, project, doc: 'draft' }} className="text-slate">
                § {item.mdAnchor.heading}
              </Link>,
            )}
          {item.codeRefs?.length
            ? row(
                'Code',
                <ul>
                  {item.codeRefs.map((r) => (
                    <li key={`${r.path}#${r.symbol ?? ''}`} className="break-all font-mono text-[11.5px]">
                      {r.path}
                      {r.symbol ? ` · ${r.symbol}` : ''} {r.verified ? <span className="text-moss">✓</span> : <span className="font-sans text-amber">not found</span>}
                    </li>
                  ))}
                </ul>,
              )
            : null}
          {detail.linked.length > 0 &&
            row(
              'Linked',
              <ul>
                {detail.linked.map((l) => (
                  <li key={l.itemId}>
                    <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: l.threadId }} className="text-slate">
                      {l.typeTitle} › {l.title}
                    </Link>
                  </li>
                ))}
              </ul>,
            )}
          {detail.decisions.length > 0 &&
            row(
              'Decisions',
              <ul>
                {detail.decisions.map((d) => (
                  <li key={d.id}>{d.text}</li>
                ))}
              </ul>,
            )}
          {item.flags?.length
            ? row(
                'May need another look',
                <ul className="text-amber">
                  {item.flags.map((f) => (
                    <li key={`${f.fromThreadId}${f.at}`}>{f.reason}</li>
                  ))}
                </ul>,
              )
            : null}
          {detail.type.screen !== 'list' && row('View', <span className="text-ink-3">The {SCREEN_NAMES[detail.type.screen]} view arrives in a later update.</span>)}
        </dl>
      )}
    </section>
  );
}
