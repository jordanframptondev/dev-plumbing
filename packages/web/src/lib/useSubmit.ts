import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type SubmitBody } from '../api/client';
import { flushPendingDrafts } from './pendingDrafts';

export const draftsLabel = (n: number) => `${n} draft${n === 1 ? '' : 's'}`;

/** Send this thread / Submit all. The response's message says what happened. */
export function useSubmit(repo: string, project: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: SubmitBody) => {
      // Typing the autosave hasn't caught yet goes too.
      await flushPendingDrafts();
      return api.submit(repo, project, body);
    },
    onSuccess: () => void qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === repo && q.queryKey[2] === project }),
  });
}
