import { LEVEL_NAMES, type WhiteboardDefense, type WhiteboardView } from '@dev-plumbing/core/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { api } from '../../api/client';
import { Button } from '../../components/Button';
import { Segmented } from '../../components/Segmented';
import { formatUpdated } from '../../lib/time';
import { ExportForm } from './ExportForm';
import { PracticeView } from './PracticeView';
import { StudyView } from './StudyView';

export type DefenseMode = 'study' | 'practice';
/** What Study and Practice are given: the page's data, with a defense in it. */
export type DefenseViewProps = { view: WhiteboardView & { defense: WhiteboardDefense }; repo: string; project: string };
/**
 * Where Practice is: the card on show (from 0) and, while "Only shaky and couldn't" is on, the question ids of the deck
 * it fixed when it was turned on. The page keeps it, so going to Study and back keeps it too.
 */
export type PracticePlace = { card: number; deck: string[] | null };
export type PracticeViewProps = DefenseViewProps & { place: PracticePlace; onPlace: (place: PracticePlace) => void };

const WAITING = 'Waiting for Claude to write the Whiteboard Defense.';
const NO_WINDOW = 'No Claude window is listening. Run /dev-plumbing in any clone.';
// Writing takes the only window for ten minutes or more, so it says what that means for threads.
const WRITING = "Claude is writing the Whiteboard Defense. Threads you send now wait until it's done.";
const GAVE_UP = "The whiteboard subagent didn't send a Whiteboard Defense.";
const INTRO = "Claude writes a defense of this plan: how it works, what could fail and what's still unknown. Then you study it and practise explaining it.";

/** One line on where the request is. Null when none is under way and the last one didn't fail. */
export function statusLine(v: WhiteboardView): string | null {
  const r = v.request;
  if (r?.state === 'requested') return v.listening ? WAITING : NO_WINDOW;
  // The window that took it went away, and no other is running: it's requeued the moment one runs /dev-plumbing.
  if (r?.state === 'writing') return v.listening ? WRITING : NO_WINDOW;
  if (r?.state === 'failed') return r.reason ?? GAVE_UP;
  return null;
}

/** "Level 2 · Standard · Based on the draft (v1) · Generated 2 hr ago". */
export function defenseMeta(d: WhiteboardDefense): string {
  return `Level ${d.level} · ${LEVEL_NAMES[d.level]} · Based on the ${d.basedOn.doc} (v${d.basedOn.version}) · Generated ${formatUpdated(d.generatedAt)}`;
}

export function DefensePage() {
  const { repo, project } = useParams({ from: '/p/$repo/$project/defense' });
  const { mode } = useSearch({ from: '/p/$repo/$project/defense' });
  return <DefenseBody repo={repo} project={project} mode={mode} />;
}

/**
 * The Whiteboard Defense page: where the request is, Generate (or Regenerate, or Try again) and Cancel (or Dismiss),
 * what the defense is based on, Study or Practice, and Export .md. The defense on show stays until a new one is saved.
 */
export function DefenseBody({ repo, project, mode }: { repo: string; project: string; mode: DefenseMode }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['whiteboard', repo, project], queryFn: () => api.whiteboard(repo, project) });
  const refresh = () => void qc.invalidateQueries({ predicate: (k) => k.queryKey[1] === repo && k.queryKey[2] === project });
  const generate = useMutation({ mutationFn: () => api.generateWhiteboard(repo, project), onSettled: refresh });
  // A window that's alive but never comes back leaves the request on "writing", so there's a way out. Dismiss uses it
  // too, to clear a failed request off a defense that's still good.
  const cancel = useMutation({ mutationFn: () => api.cancelWhiteboard(repo, project), onSettled: refresh });
  // Practice's place lives here, so Study and back keeps it. It belongs to one defense: a new one starts at card 1.
  const [place, setPlace] = useState<PracticePlace & { defenseId: string | null }>({ defenseId: null, card: 0, deck: null });
  if (q.error) return <p className="text-[13px] text-seal">{(q.error as Error).message}</p>;
  if (!q.data) return <p className="text-[13px] text-ink-3">Loading…</p>;
  const v = q.data;
  const d = v.defense;
  const status = statusLine(v);
  const failed = v.request?.state === 'failed';
  const underWay = v.request?.state === 'requested' || v.request?.state === 'writing';
  const label = failed ? 'Try again' : d ? 'Regenerate' : 'Generate';
  // The page's main action when there's nothing to study yet, it's out of date, or the last request failed.
  const primary = !d || v.stale !== null || failed;
  const error = generate.error ?? cancel.error;
  const setMode = (next: DefenseMode) => void navigate({ to: '/p/$repo/$project/defense', params: { repo, project }, search: { mode: next } });

  return (
    <div className="max-w-[80ch]" data-testid="defense">
      <h2 className="text-[20px] font-semibold">Whiteboard Defense</h2>
      <p className="mt-1 text-[12.5px] text-ink-3">If you ship it, you should be able to explain it.</p>
      {d ? (
        <>
          <p data-testid="defense-meta" className="mt-4 text-[12.5px] text-ink-2">
            {defenseMeta(d)}
          </p>
          <ul className="mt-1.5 list-disc pl-5 text-[12.5px] text-ink-3">
            {d.levelReasons.map((reason, i) => (
              <li key={i} className="break-words">
                {reason}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-4 text-[13px] text-ink-2">{INTRO}</p>
      )}
      {v.stale && (
        <p data-testid="defense-stale" className="mt-3 text-[13px] text-seal">
          {v.stale}
        </p>
      )}
      {status && (
        <p role="status" data-testid="defense-status" className={`mt-3 text-[13px] ${failed ? 'text-seal' : 'text-ink-2'}`}>
          {status}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        {underWay ? (
          <Button size="sm" data-testid="defense-cancel" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            Cancel
          </Button>
        ) : (
          <>
            <Button data-testid="defense-generate" variant={primary ? 'primary' : 'secondary'} disabled={!v.canGenerate || generate.isPending} onClick={() => generate.mutate()}>
              {label}
            </Button>
            {/* A failed request can be cleared, leaving the defense as it was. */}
            {failed && (
              <Button size="sm" data-testid="defense-dismiss" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                Dismiss
              </Button>
            )}
            {v.generateRefusal && <span className="text-[12px] text-ink-3">{v.generateRefusal}</span>}
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 whitespace-pre-line text-[12.5px] text-seal">
          {(error as Error).message}
        </p>
      )}
      {d && (
        <>
          <div className="mt-6 max-w-xs">
            <Segmented<DefenseMode>
              label="Whiteboard Defense mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'study', label: 'Study' },
                { value: 'practice', label: 'Practice' },
              ]}
            />
          </div>
          {/* Keyed by defense, so a regenerated one starts afresh: the first card, the forms closed. */}
          {mode === 'practice' ? (
            <PracticeView
              key={d.id}
              view={{ ...v, defense: d }}
              repo={repo}
              project={project}
              place={place.defenseId === d.id ? { card: place.card, deck: place.deck } : { card: 0, deck: null }}
              onPlace={(next) => setPlace({ defenseId: d.id, ...next })}
            />
          ) : (
            <StudyView key={d.id} view={{ ...v, defense: d }} repo={repo} project={project} />
          )}
          <ExportForm key={`export-${d.id}`} repo={repo} project={project} clones={v.clones} exportPath={v.exportPath} exportedTo={d.exportedTo} />
        </>
      )}
    </div>
  );
}
