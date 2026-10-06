import type { FinalizeView } from '@dev-plumbing/core/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ComponentProps } from 'react';
import Markdown, { type Components, type ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../../api/client';
import { Button } from '../../components/Button';
import { DiffView } from '../../components/DiffView';
import { inputClass } from '../../components/inputClass';
import { Segmented } from '../../components/Segmented';
import { formatUpdated } from '../../lib/time';
import { blockedReason } from '../ProjectHeader';

const STALE = 'The draft changed since Claude wrote this. Finalize again.';
const DISCARD = 'Discard this final? Finalize again writes a new one.';

type Proposal = NonNullable<FinalizeView['proposal']>;
type Final = NonNullable<FinalizeView['final']>;

/** The repo copy's full path: the clone, then the file's path inside it. */
export const exportedPath = (e: { clone: string; path: string }) => `${e.clone.replace(/\/+$/, '')}/${e.path}`;

/** The plan's folder inside the repo, '' for a plan at the top. The final goes next to it. */
const planDir = (sourcePath: string) => (sourcePath.includes('/') ? sourcePath.slice(0, sourcePath.lastIndexOf('/')) : '');

/**
 * A fenced code block. A Mermaid one gets a small caption: the app shows Mermaid as code, and GitHub and most editors
 * draw it once the final is in the repo.
 */
function CodeBlock({ node, ...rest }: ComponentProps<'pre'> & ExtraProps) {
  const code = node?.children[0];
  const classes = code?.type === 'element' ? code.properties.className : undefined;
  if (!(Array.isArray(classes) && classes.includes('language-mermaid'))) return <pre {...rest} />;
  return (
    <figure data-testid="mermaid-block" className="m-0">
      <figcaption className="mb-1 font-sans text-[11px] font-semibold text-ink-3">Mermaid</figcaption>
      <pre {...rest} />
    </figure>
  );
}

/** A relative link to one of the final's mockups, `<name>.assets/<itemId>.after|before.html`. */
const MOCKUP_LINK = /(^|\/)[^/]+\.assets\/[^/]+\.(after|before)\.html$/;
const isRelative = (href: string) => !/^[a-z][a-z\d+.-]*:/i.test(href) && !href.startsWith('/') && !href.startsWith('#');

/**
 * A link. The project keeps the mockups as item data, and Accept writes their files only into the repo copy, next to
 * the final, so in the app a mockup link would lead nowhere: it shows as plain text, with a note.
 */
function DocLink({ node, href, children, ...rest }: ComponentProps<'a'> & ExtraProps) {
  // node is react-markdown's own prop, not an attribute.
  void node;
  if (href && isRelative(href) && MOCKUP_LINK.test(href)) return <span title="Opens from the repo copy.">{children}</span>;
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}

/**
 * For any document that may hold Mermaid or mockup links: Claude's final, and the Final, Draft and Original
 * documents.
 */
export const MARKDOWN_COMPONENTS: Components = { pre: CodeBlock, a: DocLink };

/**
 * Claude's final, waiting for you: the preview (or what changed since the last final), and the accept form.
 * Accept copies it into the chosen clone; a final written for an older draft can't be accepted. Its Finalize again
 * is off, with the reason, while something blocks Finalize (`canStart` and `blockingCount` are the checklist's).
 */
export function ProposalView({
  repo,
  project,
  proposal,
  clones,
  name,
  sourcePath,
  canStart,
  blockingCount,
}: {
  repo: string;
  project: string;
  proposal: Proposal;
  clones: FinalizeView['clones'];
  name: string;
  sourcePath: string;
  canStart: boolean;
  blockingCount: number;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'preview' | 'changes'>('preview');
  const [clone, setClone] = useState(clones[0]?.path ?? '');
  const refresh = () => {
    void qc.invalidateQueries({ predicate: (k) => k.queryKey[1] === repo && k.queryKey[2] === project });
    void qc.invalidateQueries({ queryKey: ['projects'] });
  };
  const accept = useMutation({ mutationFn: () => api.acceptFinal(repo, project, clone), onSuccess: refresh });
  const discard = useMutation({ mutationFn: () => api.discardProposal(repo, project), onSuccess: refresh });
  const again = useMutation({ mutationFn: () => api.startFinalize(repo, project), onSettled: refresh });
  const error = accept.error ?? discard.error ?? again.error;
  const busy = accept.isPending || discard.isPending || again.isPending;
  const showing = mode === 'changes' && proposal.diff ? 'changes' : 'preview';
  const dir = planDir(sourcePath);
  const target = clone ? `${clone}/${dir ? `${dir}/` : ''}${name}.final.md` : '';

  return (
    <section aria-label="Claude's final" className="mt-5" data-testid="proposal">
      {proposal.diff ? (
        <div className="max-w-md">
          <Segmented
            label="Final view"
            value={showing}
            onChange={setMode}
            options={[
              { value: 'preview', label: 'Preview' },
              { value: 'changes', label: 'Changes since the last final' },
            ]}
          />
        </div>
      ) : (
        <h3 className="text-[15px] font-semibold">Preview</h3>
      )}
      {showing === 'changes' && proposal.diff ? (
        <div data-testid="proposal-diff" className="mt-3">
          <DiffView segments={proposal.diff} />
        </div>
      ) : (
        <article data-testid="proposal-preview" className="doc mt-3 max-w-[72ch]">
          <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
            {proposal.markdown}
          </Markdown>
        </article>
      )}
      {proposal.stale && <p className="mt-4 text-[13px] text-seal">{STALE}</p>}
      <form
        data-testid="accept-form"
        className="mt-4 border-t-[0.5px] border-separator pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          accept.mutate();
        }}
      >
        {clones.length > 0 ? (
          <>
            <label htmlFor="copy-into" className="text-[12px] font-semibold text-ink-3">
              Copy into
            </label>
            <select id="copy-into" value={clone} onChange={(e) => setClone(e.target.value)} className={`${inputClass} mt-1 font-mono`}>
              {clones.map((c) => (
                <option key={c.path} value={c.path}>
                  {c.source ? `${c.path} (source)` : c.path}
                </option>
              ))}
            </select>
            <p data-testid="accept-target" className="mt-1 break-all font-mono text-[11.5px] text-ink-3">
              {target}
            </p>
          </>
        ) : (
          <p className="text-[13px] text-ink-3">None of the clones this project was opened from is on this Mac.</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="submit" variant={proposal.stale ? 'secondary' : 'primary'} disabled={proposal.stale || !clone || busy}>
            Accept
          </Button>
          {proposal.stale && (
            <Button variant="primary" disabled={!canStart || busy} onClick={() => again.mutate()}>
              Finalize again
            </Button>
          )}
          {proposal.stale && !canStart && <span className="text-[12px] text-ink-3">{blockedReason(blockingCount)}</span>}
          <Button
            disabled={busy}
            onClick={() => {
              if (window.confirm(DISCARD)) discard.mutate();
            }}
          >
            Discard
          </Button>
        </div>
        {error && (
          <p role="alert" className="mt-2 whitespace-pre-line text-[12.5px] text-seal">
            {(error as Error).message}
          </p>
        )}
      </form>
    </section>
  );
}

/** After Accept: where the final went, how much has changed since, and the command to run next. */
export function FinalDone({ final, changesSinceFinal: n, planVersionSinceFinal }: { final: Final; changesSinceFinal: number; planVersionSinceFinal: number | null }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = () => {
    // No clipboard outside a secure page: the command stays there to select by hand.
    void navigator.clipboard?.writeText(final.nextCommand).then(
      () => setCopied(true),
      () => undefined,
    );
  };
  return (
    <section data-testid="final-done" aria-label="Finalized" className="mt-4">
      <p className="text-[13px] font-semibold text-moss">Finalized</p>
      <p className="mt-1 text-[12.5px] text-ink-2">
        Copied to{' '}
        <span className="break-all font-mono">{exportedPath(final.exportedTo)}</span> · {formatUpdated(final.exportedTo.at)}
      </p>
      <p className="mt-0.5 text-[12px] text-ink-3">{n === 0 ? 'No changes' : n === 1 ? '1 change' : `${n} changes`} since the last final.</p>
      {planVersionSinceFinal !== null && (
        <p className="mt-0.5 text-[12px] text-ink-3" data-testid="plan-version-since-final">
          The plan's v{planVersionSinceFinal} came in since the last final.
        </p>
      )}
      <h3 className="mt-4 text-[12px] font-semibold text-ink-3">Next</h3>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <code data-testid="next-command" className="min-w-0 break-all font-mono text-[12.5px] text-ink">
          {final.nextCommand}
        </code>
        <Button size="sm" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </section>
  );
}
