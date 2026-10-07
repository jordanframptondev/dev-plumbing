/** A thin moss bar on the selection tint: `resolved` of `total`. `label` names it for screen readers. */
export function ProgressBar({ resolved, total, withClaude = 0, label = 'Resolved threads' }: { resolved: number; total: number; withClaude?: number; label?: string }) {
  const pct = (n: number) => `${total ? Math.round((n / total) * 100) : 0}%`;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={resolved} className="flex h-1 w-full overflow-hidden rounded-full bg-selection">
      <span className="h-full bg-moss" style={{ width: pct(resolved) }} />
      <span className="h-full bg-slate/50" style={{ width: pct(withClaude) }} />
    </div>
  );
}
