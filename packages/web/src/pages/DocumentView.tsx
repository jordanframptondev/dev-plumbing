import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../api/client';

export function DocumentView() {
  const { repo, project, doc } = useParams({ from: '/p/$repo/$project/d/$doc' });
  const { data, error } = useQuery({ queryKey: ['doc', repo, project, doc], queryFn: () => api.document(repo, project, doc) });
  if (error) return <p className="text-[13px] text-seal">{(error as Error).message}</p>;
  if (!data) return null;
  if (data.text === null) {
    return <p className="text-[13px] text-ink-3">{doc === 'final' ? 'No final version yet. Finalize spec creates it.' : 'This document is missing.'}</p>;
  }
  return (
    <article className="doc max-w-[72ch]" data-testid="document">
      <Markdown remarkPlugins={[remarkGfm]}>{data.text}</Markdown>
    </article>
  );
}
