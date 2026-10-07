import type { PracticeView as Practice, Rating, WhiteboardDefense, WhiteboardView } from '@dev-plumbing/core/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { Button } from '../../components/Button';
import { ProgressBar } from '../../components/ProgressBar';
import { Switch } from '../../components/Switch';
import { DefenseChecklist } from './DefenseChecklist';
import type { PracticeViewProps } from './DefensePage';
import { Flashcard, RATINGS } from './Flashcard';

/** Nothing rated or ticked yet. The service sends practice with every defense; this only covers a gap. */
const fresh = (d: WhiteboardDefense): Practice => ({
  ratings: {},
  ticks: [],
  readiness: 0,
  counts: { could: 0, shaky: 0, couldnt: 0, unrated: d.questions.length, ticked: 0, checklist: d.checklist.length },
});
const SHAKY = "Only shaky and couldn't";

/** True when a key press is typing into a field, not practising: the keys are the field's then. */
const typing = (e: KeyboardEvent) => e.target instanceof Element && e.target.closest('input, textarea, select') !== null;
/** True when the focus is on a control that Space or Enter activates: the key is the control's then, not "show answer". */
const onControl = (e: KeyboardEvent) =>
  e.target instanceof Element && e.target.closest('button, a, input, textarea, select, [role=switch], [role=tab], [contenteditable]') !== null;

/**
 * Practice: how ready you are, one card at a time, and the checklist. Show answer (or Space or Enter) reveals the
 * answer and the ratings; a rating (or 1, 2 or 3) is saved and moves to the next card; ← and → move. "Only shaky and
 * couldn't" narrows the deck to the cards rated so when it's turned on. The page keeps the card and the deck (`place`),
 * so Study and back keeps them. A rating or a tick is saved straight away, and the service's answer is shown at once;
 * the live update that follows agrees with it.
 */
export function PracticeView({ view, repo, project, place, onPlace }: PracticeViewProps) {
  const d = view.defense;
  const qc = useQueryClient();
  const p = view.practice ?? fresh(d);
  const key = ['whiteboard', repo, project];
  const keep = (next: Practice) => qc.setQueryData<WhiteboardView>(key, (v) => (v ? { ...v, practice: next } : v));
  const reload = () => void qc.invalidateQueries({ queryKey: key });
  // The line being ticked shows where it's going, from the click until the service answers.
  const [ticking, setTicking] = useState<{ checklistId: string; ticked: boolean } | null>(null);
  // Whether the card's answer shows. Each card starts hidden.
  const [shown, setShown] = useState(false);
  // The deck: every card, or the ones "Only shaky and couldn't" fixed when it was turned on.
  const deck = place.deck === null ? d.questions : d.questions.filter((q) => place.deck!.includes(q.id));
  const n = deck.length;
  const at = Math.min(place.card, Math.max(n - 1, 0));
  const q = deck[at];
  const go = (card: number) => {
    setShown(false);
    onPlace({ ...place, card });
  };
  const rate = useMutation({
    mutationFn: (o: { questionId: string; rating: Rating | null; card: number }) => api.ratePractice(repo, project, { defenseId: d.id, questionId: o.questionId, rating: o.rating }),
    onSuccess: (next, o) => {
      keep(next);
      // A rating moves to the next card. On the last it stays, showing the rating; clearing one stays too.
      if (o.rating !== null && o.card < n - 1) go(o.card + 1);
    },
    onError: reload,
  });
  const tick = useMutation({
    mutationFn: (o: { checklistId: string; ticked: boolean }) => api.tickPractice(repo, project, { defenseId: d.id, ...o }),
    onSuccess: keep,
    onError: reload,
    onSettled: () => setTicking(null),
  });
  /** Rates the card on show. Its rating again clears it. */
  const rateCard = (rating: Rating | null) => {
    if (q) rate.mutate({ questionId: q.id, rating, card: at });
  };
  const toggleDeck = (on: boolean) => {
    setShown(false);
    onPlace({ card: 0, deck: on ? d.questions.filter((x) => p.ratings[x.id] === 'shaky' || p.ratings[x.id] === 'couldnt').map((x) => x.id) : null });
  };

  // The keys, while you aren't typing in a field: Space or Enter reveals, 1–3 rate once revealed, ← and → move.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!q || e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      if ((e.key === ' ' || e.key === 'Enter') && !shown) {
        if (onControl(e)) return;
        // So a focused button isn't pressed too.
        e.preventDefault();
        setShown(true);
      } else if (shown && !rate.isPending && ['1', '2', '3'].includes(e.key)) {
        const value = RATINGS[Number(e.key) - 1]!.value;
        rateCard(p.ratings[q.id] === value ? null : value);
      } else if (e.key === 'ArrowLeft' && at > 0 && !rate.isPending) {
        go(at - 1);
      } else if (e.key === 'ArrowRight' && at < n - 1 && !rate.isPending) {
        go(at + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const c = p.counts;
  const error = rate.error ?? tick.error;

  return (
    <div className="mt-6 max-w-[72ch]" data-testid="practice">
      <section aria-label="Readiness">
        <p data-testid="readiness" className="text-[13px] font-semibold">
          Readiness {p.readiness}%
        </p>
        <div className="mt-1.5">
          <ProgressBar resolved={p.readiness} total={100} label="Readiness" />
        </div>
        <p data-testid="practice-counts" className="mt-1.5 text-[12px] text-ink-3">
          {c.could} could explain · {c.shaky} shaky · {c.couldnt} couldn't · {c.unrated} not yet
        </p>
      </section>
      {d.questions.length === 0 ? (
        <p className="mt-6 text-[13px] text-ink-3">No questions in this defense.</p>
      ) : (
        <>
          <div className="mt-6 flex items-center gap-2.5">
            <Switch id="practice-shaky" checked={place.deck !== null} onChange={toggleDeck} label={SHAKY} disabled={rate.isPending} />
            <label htmlFor="practice-shaky" className="text-[13px] text-ink-2">
              {SHAKY}
            </label>
          </div>
          <div className="mt-4">
            {q ? (
              <>
                <Flashcard
                  key={q.id}
                  repo={repo}
                  project={project}
                  defenseId={d.id}
                  question={q}
                  i={at + 1}
                  n={n}
                  rating={p.ratings[q.id] ?? null}
                  shown={shown}
                  onShow={() => setShown(true)}
                  busy={rate.isPending}
                  onRate={rateCard}
                  asked={view.asked}
                />
                <div className="mt-3 flex gap-2">
                  <Button size="sm" disabled={at === 0 || rate.isPending} onClick={() => go(at - 1)}>
                    Previous
                  </Button>
                  <Button size="sm" disabled={at >= n - 1 || rate.isPending} onClick={() => go(at + 1)}>
                    Next
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-[13px] text-ink-3">Nothing rated shaky or couldn't.</p>
            )}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[12.5px] text-seal">
          {(error as Error).message}
        </p>
      )}
      <DefenseChecklist
        checklist={d.checklist}
        ticks={p.ticks}
        pending={ticking ?? undefined}
        onTick={(checklistId, ticked) => {
          setTicking({ checklistId, ticked });
          tick.mutate({ checklistId, ticked });
        }}
      />
    </div>
  );
}
