import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../api/client';
import { Segmented } from '../components/Segmented';
import { formatUpdated } from '../lib/time';
import { ChangesView } from './ChangesView';
import { exportedPath, MARKDOWN_COMPONENTS } from './finalize/ProposalView';

export function DocumentView() {
  const { repo, project, doc } = useParams({ from: '/p/$repo/$project/d/$doc' });
  // Keyed by document, so the Document | Changes switch starts on Document for each one.
  return <DocumentBody key={doc} repo={repo} project={project} doc={doc} />;
}

function DocumentBody({ repo, project, doc }: { repo: string; project: string; doc: string }) {
  const [mode, setMode] = useState<'document' | 'changes'>('document');
  const { data, error } = useQuery({ queryKey: ['doc', repo, project, doc], queryFn: () => api.document(repo, project, doc) });
  // Already loaded by the project layout: it says where the final was copied.
  const home = useQuery({ queryKey: ['projectHome', repo, project], queryFn: () => api.projectHome(repo, project) });
  const exported = doc === 'final' ? home.data?.project.docs.exportedTo : undefined;
  const switcher =
    doc === 'draft' ? (
      <div className="mb-4 max-w-xs">
        <Segmented
          label="Draft view"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'document', label: 'Document' },
            { value: 'changes', label: 'Changes' },
          ]}
        />
      </div>
    ) : null;
  if (doc === 'draft' && mode === 'changes') {
    return (
      <>
        {switcher}
        <ChangesView repo={repo} project={project} />
      </>
    );
  }
  if (error) return <p className="text-[13px] text-seal">{(error as Error).message}</p>;
  if (!data) return null;
  if (data.text === null) {
    return <p className="text-[13px] text-ink-3">{doc === 'final' ? 'No final version yet. Finalize spec creates it.' : 'This document is missing.'}</p>;
  }
  return (
    <>
      {switcher}
      {exported && (
        <p data-testid="final-exported" className="mb-3 text-[12px] text-ink-3">
          Copied to{' '}
          <span className="break-all font-mono text-ink-2">{exportedPath(exported)}</span> · {formatUpdated(exported.at)}
        </p>
      )}
      <article className="doc max-w-[72ch]" data-testid="document">
        <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
          {data.text}
        </Markdown>
      </article>
    </>
  );
}
