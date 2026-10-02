import type { ListeningState } from '@dev-plumbing/core/schemas';

export function ListeningMark({ state }: { state: ListeningState | undefined }) {
  if (!state) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-moss" data-testid="claude-listening">
      <span aria-hidden="true" className="inline-block h-[7px] w-[7px] rounded-full bg-moss" />
      {state === 'busy' ? 'Claude working' : 'Claude listening'}
    </span>
  );
}
