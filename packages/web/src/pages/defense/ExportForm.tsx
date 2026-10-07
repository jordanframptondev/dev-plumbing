import type { DefenseExport, WhiteboardView } from '@dev-plumbing/core/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';
import { Button } from '../../components/Button';
import { inputClass } from '../../components/inputClass';
import { exportedPath } from '../finalize/ProposalView';

/**
 * Export .md: the defense as `<name>.whiteboard-defense.md` next to the plan, in the clone you pick (the source clone
 * first). Each export overwrites the last one there. `exportPath` is the file's path inside a clone.
 */
export function ExportForm({
  repo,
  project,
  clones,
  exportPath,
  exportedTo,
}: {
  repo: string;
  project: string;
  clones: WhiteboardView['clones'];
  exportPath: string;
  exportedTo: DefenseExport | undefined;
}) {
  const qc = useQueryClient();
  const [clone, setClone] = useState(clones[0]?.path ?? '');
  const run = useMutation({
    mutationFn: () => api.exportDefense(repo, project, clone),
    onSuccess: () => void qc.invalidateQueries({ predicate: (k) => k.queryKey[1] === repo && k.queryKey[2] === project }),
  });
  // This export, or the last one the defense remembers.
  const done = run.data?.exportedTo ?? exportedTo;

  return (
    <form
      aria-label="Export"
      data-testid="defense-export"
      className="mt-10 border-t-[0.5px] border-separator pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        run.mutate();
      }}
    >
      {clones.length > 0 ? (
        <>
          <label htmlFor="export-into" className="text-[12px] font-semibold text-ink-3">
            Export into
          </label>
          <select id="export-into" value={clone} onChange={(e) => setClone(e.target.value)} className={`${inputClass} mt-1 font-mono`}>
            {clones.map((c) => (
              <option key={c.path} value={c.path}>
                {c.source ? `${c.path} (source)` : c.path}
              </option>
            ))}
          </select>
          <p data-testid="export-target" className="mt-1 break-all font-mono text-[11.5px] text-ink-3">
            {clone}/{exportPath}
          </p>
          {done && <p className="mt-0.5 text-[11.5px] text-ink-3">Replaces the file there.</p>}
        </>
      ) : (
        <p className="text-[13px] text-ink-3">None of the clones this project was opened from is on this Mac.</p>
      )}
      <div className="mt-3">
        <Button type="submit" disabled={!clone || run.isPending}>
          Export .md
        </Button>
      </div>
      {done && (
        <p role="status" data-testid="defense-exported" className="mt-2 break-all text-[12.5px] text-ink-2">
          Exported to {exportedPath(done)}.
        </p>
      )}
      {run.error && (
        <p role="alert" className="mt-2 whitespace-pre-line text-[12.5px] text-seal">
          {(run.error as Error).message}
        </p>
      )}
    </form>
  );
}
