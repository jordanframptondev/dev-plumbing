import type { DisplayStatus } from '@dev-plumbing/core/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * A thread's quiet reviewed mark: "Mark as reviewed", or "✓ Reviewed · Undo" once marked. Its only effect is taking the
 * item off the Finalize page's "Nobody has reviewed these"; the thread is left as it is. Hidden once the thread is
 * resolved or parked, as those aren't on that list.
 */
export function ReviewedMark({ repo, project, itemId, status, reviewedAt }: { repo: string; project: string; itemId: string; status: DisplayStatus; reviewedAt?: string }) {
  const qc = useQueryClient();
  const review = useMutation({
    mutationFn: (reviewed: boolean) => api.setReviewed(repo, project, itemId, reviewed),
    onSettled: () => void qc.invalidateQueries({ predicate: (k) => k.queryKey[1] === repo && k.queryKey[2] === project }),
  });
  if (status === 'resolved' || status === 'parked') return null;
  return (
    <span className="ml-auto flex flex-col items-end text-[12px]">
      <span data-testid="reviewed-mark">
        {reviewedAt ? (
          <>
            <span className="text-ink-2">
              <span aria-hidden="true">✓ </span>Reviewed
            </span>
            <span aria-hidden="true" className="text-ink-3">
              {' · '}
            </span>
            <button type="button" className="text-slate disabled:opacity-40" disabled={review.isPending} onClick={() => review.mutate(false)}>
              Undo
            </button>
          </>
        ) : (
          <button type="button" className="text-slate disabled:opacity-40" disabled={review.isPending} onClick={() => review.mutate(true)}>
            Mark as reviewed
          </button>
        )}
      </span>
      {review.error && (
        <span role="alert" className="mt-1 text-[12px] text-seal">
          {(review.error as Error).message}
        </span>
      )}
    </span>
  );
}
