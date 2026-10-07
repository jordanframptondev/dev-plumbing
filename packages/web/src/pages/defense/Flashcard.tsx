import type { DefenseLink, Rating, WhiteboardDefense } from '@dev-plumbing/core/schemas';
import { Button } from '../../components/Button';
import { AskClaude } from './AskClaude';
import { BasisLabel } from './labels';

/** The three ratings you give yourself, in order (the keys 1, 2 and 3), each with the colour of its text once chosen. */
export const RATINGS: { value: Rating; label: string; tone: string }[] = [
  { value: 'could', label: 'Could explain it', tone: 'text-moss' },
  { value: 'shaky', label: 'Shaky', tone: 'text-amber' },
  { value: 'couldnt', label: "Couldn't", tone: 'text-seal' },
];
const CHIP = 'inline-flex items-center rounded-[6px] border-[0.5px] border-separator px-2.5 py-1 text-[11.5px] font-medium aria-disabled:cursor-not-allowed aria-disabled:opacity-40';

/**
 * One question to explain out loud. Show answer reveals the defense's answer and how sure it is, and only then the
 * ratings you give yourself. Choosing your rating again clears it. Practice keeps whether it's shown, so its keys work.
 * While a rating saves (`busy`) the ratings are marked aria-disabled and ignore presses, rather than being disabled, so
 * the one you pressed keeps the focus.
 */
export function Flashcard({
  repo,
  project,
  defenseId,
  question,
  i,
  n,
  rating,
  shown,
  onShow,
  busy,
  onRate,
  asked,
}: {
  repo: string;
  project: string;
  defenseId: string;
  question: WhiteboardDefense['questions'][number];
  /** Its place in the deck, from 1. */
  i: number;
  n: number;
  rating: Rating | null;
  /** Whether the answer is showing. */
  shown: boolean;
  onShow: () => void;
  busy: boolean;
  onRate: (rating: Rating | null) => void;
  asked: DefenseLink[];
}) {
  return (
    <article data-testid="flashcard" aria-label={`Card ${i} of ${n}`} className="rounded-[12px] border-[0.5px] border-separator bg-cell p-4">
      <p className="text-[12px] text-ink-3">
        Card {i} of {n}
      </p>
      <h3 className="mt-1 break-words text-[17px] font-semibold leading-snug">{question.q}</h3>
      {shown ? (
        <>
          <p data-testid="flashcard-answer" className="mt-3 break-words text-[14px] leading-relaxed">
            <span className="whitespace-pre-line">{question.a}</span> <BasisLabel basis={question.basis} />
          </p>
          <div role="group" aria-label="Your rating" className="mt-4 flex flex-wrap gap-2">
            {RATINGS.map((r) => {
              const chosen = rating === r.value;
              return (
                <button
                  key={r.value}
                  type="button"
                  aria-pressed={chosen}
                  aria-disabled={busy || undefined}
                  onClick={() => {
                    if (!busy) onRate(chosen ? null : r.value);
                  }}
                  className={`${CHIP} ${chosen ? `bg-selection ${r.tone}` : 'bg-cell text-ink'}`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="mt-3">
          <Button size="sm" data-testid="show-answer" onClick={onShow}>
            Show answer
          </Button>
        </div>
      )}
      <AskClaude repo={repo} project={project} defenseId={defenseId} kind="question" partRef={question.id} asked={asked} />
    </article>
  );
}
