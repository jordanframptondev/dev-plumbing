import { parseData, type PhaseData, type TypeItemRow } from '@dev-plumbing/core/schemas';
import { StatusMark } from '../../components/StatusMark';

/** Phases in order, then the items without valid phase data, which show as "Phase ?". */
function phaseChips(rows: TypeItemRow[]): { row: TypeItemRow; phase: PhaseData | null }[] {
  const chips = rows.map((row) => {
    const r = parseData('timeline', row.data);
    return { row, phase: r.ok ? r.data : null };
  });
  const placed = chips.filter((c) => c.phase).sort((a, b) => a.phase!.order - b.phase!.order);
  return [...placed, ...chips.filter((c) => !c.phase)];
}

/**
 * Phases & milestones at a glance: one chip per phase, stacked on a phone, at most two side by side from 768 to
 * 1099 px (§16), and as many as fit on a wider screen.
 */
export function TimelineStrip({ rows, selected, onSelect }: { rows: TypeItemRow[]; selected: string | null; onSelect: (itemId: string) => void }) {
  const chips = phaseChips(rows);
  if (!chips.length) return null;
  return (
    <ol aria-label="Timeline" data-testid="timeline" className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2 min-[1100px]:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
      {chips.map(({ row, phase }) => {
        const on = selected === row.id;
        return (
          <li key={row.id} className="min-w-0">
            <button
              type="button"
              data-testid="phase-chip"
              aria-pressed={on}
              onClick={() => onSelect(row.id)}
              className={`flex h-full w-full flex-col items-start rounded-[10px] border-[0.5px] bg-cell px-3 py-2 text-left ${on ? 'border-slate' : 'border-separator'}`}
            >
              <span className="flex w-full items-center gap-2 text-[11px] text-ink-3">
                {phase ? `Phase ${phase.order}` : 'Phase ?'}
                <span className="ml-auto">
                  <StatusMark status={row.status} />
                </span>
              </span>
              <span className="mt-0.5 text-[13px] font-semibold leading-snug">{row.title}</span>
              {phase ? (
                <>
                  <span className="mt-0.5 line-clamp-2 text-[12px] text-ink-2">{phase.goal}</span>
                  <span className="mt-1.5 text-[11px] text-ink-3">
                    Done when: {phase.doneWhen.length} · {phase.itemIds.length} item{phase.itemIds.length === 1 ? '' : 's'}
                  </span>
                </>
              ) : (
                <span className="mt-0.5 text-[12px] text-ink-3">No goal yet</span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
