import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, type SubmitBody } from '../api/client';

export const draftsLabel = (n: number) => `${n} draft${n === 1 ? '' : 's'}`;

/** Send this thread / Submit all. The response's message says what happened. */
export function useSubmit(repo: string, project: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SubmitBody) => api.submit(repo, project, body),
    onSuccess: () => void qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === repo && q.queryKey[2] === project }),
  });
}
