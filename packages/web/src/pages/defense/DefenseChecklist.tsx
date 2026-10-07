import type { WhiteboardDefense } from '@dev-plumbing/core/schemas';

const LIST = 'mt-2 overflow-hidden rounded-[10px] border-[0.5px] border-separator bg-cell [&>*+*]:border-t-[0.5px] [&>*+*]:border-separator';

/**
 * The defense's checklist, to tick as you practise. `ticks` are the ids ticked. While a tick is on its way
 * (`pending`) its box shows where it's going, and every box waits, so two ticks can't race: marked aria-disabled and
 * ignoring changes, rather than disabled, so the box you ticked keeps the focus.
 */
export function DefenseChecklist({
  checklist,
  ticks,
  pending,
  onTick,
}: {
  checklist: WhiteboardDefense['checklist'];
  ticks: string[];
  pending?: { checklistId: string; ticked: boolean };
  onTick: (checklistId: string, ticked: boolean) => void;
}) {
  const on = new Set(ticks);
  const ticked = checklist.filter((k) => on.has(k.id)).length;
  const checked = (id: string) => (pending?.checklistId === id ? pending.ticked : on.has(id));
  return (
    <section data-testid="defense-checklist" aria-label="Checklist" className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-[15px] font-semibold">Checklist</h3>
        <p className="text-[12px] text-ink-3">
          {ticked} of {checklist.length} ticked
        </p>
      </div>
      <ul className={LIST}>
        {checklist.map((k) => (
          <li key={k.id}>
            <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5 text-[13px]">
              <input
                type="checkbox"
                checked={checked(k.id)}
                aria-disabled={pending !== undefined || undefined}
                onChange={(e) => {
                  if (pending === undefined) onTick(k.id, e.target.checked);
                }}
                className="mt-0.5 size-3.5 shrink-0 accent-slate aria-disabled:cursor-not-allowed aria-disabled:opacity-40"
              />
              <span className="min-w-0 break-words">{k.text}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
