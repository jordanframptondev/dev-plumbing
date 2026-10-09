import type { DiffSegment, ItemVersionChange } from '@dev-plumbing/core/schemas';
import { DiffView } from '../components/DiffView';

/**
 * What the newest plan version that changed this item changed in it, folded away until you open it: a diff of each
 * part that changed, or "Nothing else changed." when the re-import changed only something else (its title, say). A
 * re-import from before Plan 7 kept no copy of what it left, so that one is "Changed since before v<n>".
 */
export function VersionChange({ change }: { change: ItemVersionChange }) {
  const parts: [string, DiffSegment[] | null][] = [
    ['Summary', change.summary],
    ['Details', change.body],
    ['Fields', change.fields],
    ['Drawing', change.drawing],
  ];
  const changed = parts.filter((p): p is [string, DiffSegment[]] => p[1] !== null);
  return (
    <details className="mt-3 rounded-[10px] border-[0.5px] border-separator px-4 py-2.5" data-testid="version-change">
      <summary className="cursor-pointer text-[12.5px] text-slate">{change.since ? `Changed since before v${change.version}` : `What v${change.version} changed`}</summary>
      {changed.length ? (
        changed.map(([label, segments]) => (
          <section key={label} aria-label={label} className="mt-2.5">
            <h3 className="text-[11px] font-semibold text-ink-3">{label}</h3>
            <DiffView segments={segments} />
          </section>
        ))
      ) : (
        <p className="mt-2 text-[12.5px] text-ink-3">Nothing else changed.</p>
      )}
    </details>
  );
}
