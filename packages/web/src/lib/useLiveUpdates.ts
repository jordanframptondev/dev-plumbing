import type { LiveEvent } from '@dev-plumbing/core/schemas';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

/** Keeps every screen current: the service pushes an event whenever something changes. */
export function useLiveUpdates(): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/events');
    source.onmessage = (message) => {
      let event: LiveEvent;
      try {
        event = JSON.parse(message.data) as LiveEvent;
      } catch {
        return;
      }
      if (event.type === 'project') {
        void qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === event.repo && q.queryKey[2] === event.id });
        void qc.invalidateQueries({ queryKey: ['projects'] });
      } else if (event.type === 'projects') {
        void qc.invalidateQueries({ queryKey: ['projects'] });
      } else if (event.type === 'config') {
        void qc.invalidateQueries({ queryKey: ['config'] });
      }
    };
    return () => source.close();
  }, [qc]);
}
