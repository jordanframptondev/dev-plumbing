import { parseData, type DataChecks, type DataKind } from '@dev-plumbing/core/schemas';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { deviceForWindow, MockupFrame, markupHash } from '../../components/MockupFrame';
import { DiagramView } from '../../diagram/DiagramView';
import { TableCard } from './DatabaseScreen';
import { DataProblem } from './DataProblem';
import { FlowView, useMockupItems } from './FlowsScreen';
import { readMockup, type Mockup } from './MockupsScreen';

/** A thread option whose change redraws a mockup. The frame loads that option's markup, which isn't stored until it's accepted. */
type Proposal = { threadId: string; optionId: string };
type Props = { kind: DataKind; data: unknown; checks: DataChecks | null; repo: string; project: string; itemId: string; compact?: boolean; proposal?: Proposal };

/**
 * A UI item: its After mockup, where the screen lives, and a link to it on the UI changes screen.
 * With `proposal` ("View proposed"), the frame shows the option's proposed mockup instead of the saved one.
 * In a preview (`compact`) the link is left out, because UI changes shows the saved mockup.
 * Markup that breaks a write rule is still drawn, as UI changes draws it, with the rules it breaks listed under it.
 */
function MockupView({
  mockup,
  problems,
  repo,
  project,
  itemId,
  compact,
  proposal,
}: {
  mockup: Mockup;
  problems: string[];
  repo: string;
  project: string;
  itemId: string;
  compact?: boolean;
  proposal?: Proposal;
}) {
  const typeId = useMockupItems(repo, project).get(itemId)?.typeId;
  // Phone width on a phone, as UI changes picks it.
  const [device] = useState(deviceForWindow);
  const where = [mockup.route, ...mockup.files].filter(Boolean).join(' · ');
  const after = mockup.after?.trim();
  // The URL stays the same when the markup is redrawn (an accepted option, a small edit, an Undo), so the markup's hash
  // is what reloads the frame. A proposal is also told apart by its thread and option.
  const version = after && (proposal ? `${proposal.threadId}/${proposal.optionId}/${markupHash(after)}` : markupHash(after));
  return (
    <div data-testid="mockup-view">
      {after ? (
        <MockupFrame repo={repo} project={project} itemId={itemId} side="after" device={device} proposal={proposal} version={version} />
      ) : (
        <p className="text-[13px] text-ink-3">No mockup yet.</p>
      )}
      {problems.length > 0 && (
        <ul data-testid="mockup-problems" className="mt-1.5 text-[11.5px] text-ink-3">
          {problems.map((problem) => (
            <li key={problem} className="break-words">
              {problem}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {where && <span className="min-w-0 break-all font-mono text-[11px] text-ink-3">{where}</span>}
        {typeId && !compact && (
          <Link to="/p/$repo/$project/t/$type" params={{ repo, project, type: typeId }} search={{ item: itemId }} className="ml-auto text-[12px] text-slate">
            Open in UI changes
          </Link>
        )}
      </div>
    </div>
  );
}

/** The item's drawing, for the thread view and for "View proposed". Data that doesn't fit its shape shows why. */
export function ItemDataView(p: Props) {
  // The thread view already shows the item's title and is its thread, so the problem block has neither.
  const problem = (problems: string[]) => <DataProblem problems={problems} data={p.data} repo={p.repo} project={p.project} />;
  switch (p.kind) {
    case 'diagram': {
      const r = parseData('diagram', p.data);
      if (!r.ok) return problem(r.problems);
      // ✓ and "not found" only when the boxes were checked against the clone.
      return <DiagramView data={r.data} checks={p.checks?.kind === 'diagram' && p.checks.checked ? p.checks.nodes : undefined} compact />;
    }
    case 'database': {
      const r = parseData('database', p.data);
      if (!r.ok) return problem(r.problems);
      // No row: the thread view shows the item's title, status and thread itself.
      return <TableCard data={r.data} checks={p.checks} repo={p.repo} project={p.project} />;
    }
    case 'mockups': {
      // Read leniently, as UI changes reads it: only data with no markup to draw falls back to the problem block.
      const { mockup, problems } = readMockup(p.data);
      if (mockup && (mockup.after || mockup.before || problems.length === 0)) {
        return <MockupView mockup={mockup} problems={problems} repo={p.repo} project={p.project} itemId={p.itemId} compact={p.compact} proposal={p.proposal} />;
      }
      const r = parseData('mockups', p.data);
      return problem(r.ok ? problems : r.problems);
    }
    case 'flows': {
      const r = parseData('flows', p.data);
      if (!r.ok) return problem(r.problems);
      return <FlowView flow={r.data} repo={p.repo} project={p.project} />;
    }
    case 'timeline': {
      const r = parseData('timeline', p.data);
      if (!r.ok) return problem(r.problems);
      const phase = r.data;
      return (
        <div data-testid="phase-view" className="text-[12.5px]">
          <p className="text-[11px] font-semibold text-ink-3">Phase {phase.order}</p>
          <p className="mt-0.5">{phase.goal}</p>
          <p className="mt-2 text-[11px] font-semibold text-ink-3">Done when</p>
          <ul className="ml-4 list-disc text-ink-2">
            {phase.doneWhen.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11.5px] text-ink-3">
            {phase.itemIds.length} item{phase.itemIds.length === 1 ? '' : 's'} in this phase
          </p>
        </div>
      );
    }
  }
}
