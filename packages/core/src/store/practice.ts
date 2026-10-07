import type { Practice, PracticeView, Rating, WhiteboardDefense } from '../schemas';
import { currentDefense, NO_PART } from './defenseItems';
import { InputError } from './io';
import { readPractice, writePractice } from './whiteboard';

// Practice is kept by text, not by id: a regenerated defense numbers its questions afresh, but a question it asks again,
// or a checklist line it still has, keeps your rating or tick.
const keyOf = (text: string) => text.trim();
const has = (record: Record<string, unknown>, key: string) => Object.hasOwn(record, key);

/** Your ratings and ticks for this defense, the counts, and readiness (Decision 8). */
export function practiceView(defense: WhiteboardDefense, practice: Practice): PracticeView {
  const ratings: Record<string, Rating> = {};
  for (const q of defense.questions) if (has(practice.ratings, keyOf(q.q))) ratings[q.id] = practice.ratings[keyOf(q.q)].rating;
  const ticks = defense.checklist.filter((k) => has(practice.ticks, keyOf(k.text))).map((k) => k.id);
  const rated = Object.values(ratings);
  const counts = {
    could: rated.filter((r) => r === 'could').length,
    shaky: rated.filter((r) => r === 'shaky').length,
    couldnt: rated.filter((r) => r === 'couldnt').length,
    unrated: defense.questions.length - rated.length,
    ticked: ticks.length,
    checklist: defense.checklist.length,
  };
  // Half the cards, half the checklist. The cards' score counts a card you could explain whole and a shaky one half;
  // the checklist's, each line ticked. With only one of them it's that one, and with neither 0.
  const scores = [
    ...(defense.questions.length ? [(counts.could + counts.shaky / 2) / defense.questions.length] : []),
    ...(defense.checklist.length ? [counts.ticked / defense.checklist.length] : []),
  ];
  const readiness = scores.length ? Math.round((100 * scores.reduce((a, b) => a + b, 0)) / scores.length) : 0;
  return { ratings, ticks, readiness, counts };
}

/** Practice with only the questions and checklist lines this defense still has. */
function kept(defense: WhiteboardDefense, practice: Practice): Practice {
  const questions = new Set(defense.questions.map((q) => keyOf(q.q)));
  const lines = new Set(defense.checklist.map((k) => keyOf(k.text)));
  return {
    ratings: Object.fromEntries(Object.entries(practice.ratings).filter(([key]) => questions.has(key))),
    ticks: Object.fromEntries(Object.entries(practice.ticks).filter(([key]) => lines.has(key))),
  };
}

/** Rates a flashcard, or clears its rating with null. */
export async function ratePractice(dir: string, o: { defenseId: string; questionId: string; rating: Rating | null; now?: Date }): Promise<PracticeView> {
  const defense = await currentDefense(dir, o.defenseId);
  const question = defense.questions.find((q) => q.id === o.questionId);
  if (!question) throw new InputError(NO_PART);
  const key = keyOf(question.q);
  const practice = await readPractice(dir);
  const { [key]: _earlier, ...ratings } = practice.ratings;
  const next = kept(defense, { ...practice, ratings: o.rating === null ? ratings : { ...ratings, [key]: { rating: o.rating, at: (o.now ?? new Date()).toISOString() } } });
  await writePractice(dir, next);
  return practiceView(defense, next);
}

/** Ticks or unticks a checklist line. A line ticked again keeps when it was first ticked. */
export async function tickPractice(dir: string, o: { defenseId: string; checklistId: string; ticked: boolean; now?: Date }): Promise<PracticeView> {
  const defense = await currentDefense(dir, o.defenseId);
  const line = defense.checklist.find((k) => k.id === o.checklistId);
  if (!line) throw new InputError(NO_PART);
  const key = keyOf(line.text);
  const practice = await readPractice(dir);
  const { [key]: earlier, ...ticks } = practice.ticks;
  const next = kept(defense, { ...practice, ticks: o.ticked ? { ...ticks, [key]: earlier ?? (o.now ?? new Date()).toISOString() } : ticks });
  await writePractice(dir, next);
  return practiceView(defense, next);
}
