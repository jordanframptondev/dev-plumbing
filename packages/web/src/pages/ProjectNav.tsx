import type { DisplayStatus, ProjectHome, TypeEntry } from '@dev-plumbing/core/schemas';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { StatusMark } from '../components/StatusMark';

const LINK = 'flex items-center gap-2 rounded-[6px] px-2 py-1.5 text-[13px] text-ink';
const ACTIVE = { className: 'bg-selection font-medium' };
const DOC_LABELS = { original: 'Original', draft: 'Draft', final: 'Final' } as const;

function typeStatus(t: TypeEntry): DisplayStatus {
  if (t.yourTurn) return 'your_turn';
  if (t.drafts) return 'draft';
  if (t.withClaude) return 'with_claude';
  if (t.itemCount > 0 && t.resolved === t.itemCount) return 'resolved';
  return 'idle';
}

const Section = ({ children }: { children: ReactNode }) => <div className="px-2 pb-1 pt-3 text-[11px] font-semibold text-ink-3">{children}</div>;

export function ProjectNav({ home, repo, project, onNavigate }: { home: ProjectHome; repo: string; project: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-px">
      <Link to="/p/$repo/$project" params={{ repo, project }} activeOptions={{ exact: true }} activeProps={ACTIVE} className={LINK} onClick={onNavigate}>
        Inbox
        <span className="ml-auto text-[11px] text-ink-3">{home.summary.counts.yourTurn || ''}</span>
      </Link>
      <Section>Plumbing</Section>
      {home.types.map((t) => (
        <Link
          key={t.id}
          to="/p/$repo/$project/t/$type"
          params={{ repo, project, type: t.id }}
          activeProps={ACTIVE}
          className={`${LINK} ${t.noChanges ? 'text-ink-3' : ''}`}
          onClick={onNavigate}
          data-testid={`nav-type-${t.id}`}
        >
          <span className="min-w-0 truncate">{t.title}</span>
          <span className="ml-auto inline-flex shrink-0 items-center text-[11px] text-ink-3">
            {t.noChanges ? 'No changes' : <span aria-hidden="true" className="inline-flex"><StatusMark status={typeStatus(t)} /></span>}
          </span>
        </Link>
      ))}
      <Section>Documents</Section>
      {(['original', 'draft', 'final'] as const).map((doc) =>
        home.documents[doc] ? (
          <Link key={doc} to="/p/$repo/$project/d/$doc" params={{ repo, project, doc }} activeProps={ACTIVE} className={LINK} onClick={onNavigate}>
            {DOC_LABELS[doc]}
          </Link>
        ) : (
          <span key={doc} className={`${LINK} text-ink-3`}>
            {DOC_LABELS[doc]}
            <span className="ml-auto text-[11px]">Not yet</span>
          </span>
        ),
      )}
      <Section>Review</Section>
      <span className={`${LINK} text-ink-3`} title="Whiteboard Defense arrives in a later update.">
        Whiteboard Defense
      </span>
    </nav>
  );
}
