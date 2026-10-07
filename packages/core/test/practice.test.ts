import { afterAll, describe, expect, it } from 'vitest';
import type { Practice, WhiteboardDefense } from '../src/schemas';
import { ConflictError, InputError } from '../src/store/io';
import { practiceView, ratePractice, tickPractice } from '../src/store/practice';
import { readPractice, writeDefense } from '../src/store/whiteboard';
import { removeTempDirs } from '../../../testkit/tmp';
import { seedProject, storedDefense } from './fixtures';

afterAll(removeTempDirs);

const T1 = new Date('2026-10-06T10:00:00.000Z');
const T2 = new Date('2026-10-06T11:00:00.000Z');
const EMPTY: Practice = { ratings: {}, ticks: {} };

async function seed(defense: WhiteboardDefense = storedDefense()): Promise<string> {
  const dir = await seedProject();
  await writeDefense(dir, defense);
  return dir;
}
const failure = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

describe('practice', () => {
  it('is at 0% with nothing rated or ticked, and with no cards or lines at all', () => {
    expect(practiceView(storedDefense(), EMPTY)).toEqual({
      ratings: {},
      ticks: [],
      readiness: 0,
      counts: { could: 0, shaky: 0, couldnt: 0, unrated: 3, ticked: 0, checklist: 20 },
    });
    expect(practiceView(storedDefense({ questions: [], checklist: [] }), EMPTY).readiness).toBe(0);
  });

  it('counts a card you could explain whole, a shaky one half, and each line ticked', async () => {
    const base = storedDefense();
    const defense = storedDefense({
      questions: [1, 2, 3, 4].map((n) => ({ id: `q${n}`, q: `Question ${n}?`, a: `Answer ${n}.`, basis: 'known' as const })),
      checklist: base.checklist.slice(0, 6),
    });
    const dir = await seed(defense);
    const rate = (questionId: string, rating: 'could' | 'shaky' | 'couldnt') => ratePractice(dir, { defenseId: 'w-test', questionId, rating, now: T1 });
    await rate('q1', 'could');
    await rate('q2', 'could');
    await rate('q3', 'shaky');
    await rate('q4', 'couldnt');
    for (const id of ['k1', 'k2', 'k3']) await tickPractice(dir, { defenseId: 'w-test', checklistId: id, ticked: true, now: T1 });
    const view = await tickPractice(dir, { defenseId: 'w-test', checklistId: 'k3', ticked: true, now: T2 });
    // The cards' (2 + 0.5) / 4 = 0.625 and the checklist's 3 / 6 = 0.5, half each: round(100 × 0.5625) = 56
    expect(view).toEqual({
      ratings: { q1: 'could', q2: 'could', q3: 'shaky', q4: 'couldnt' },
      ticks: ['k1', 'k2', 'k3'],
      readiness: 56,
      counts: { could: 2, shaky: 1, couldnt: 1, unrated: 0, ticked: 3, checklist: 6 },
    });
    // Saved by text. Ticking a line again keeps when it was first ticked.
    expect(await readPractice(dir)).toEqual({
      ratings: {
        'Question 1?': { rating: 'could', at: T1.toISOString() },
        'Question 2?': { rating: 'could', at: T1.toISOString() },
        'Question 3?': { rating: 'shaky', at: T1.toISOString() },
        'Question 4?': { rating: 'couldnt', at: T1.toISOString() },
      },
      ticks: Object.fromEntries(base.checklist.slice(0, 3).map((k) => [k.text, T1.toISOString()])),
    });
  });

  it('weighs the cards and the checklist half each, or counts only the one there is', () => {
    const d = storedDefense();
    const at = T1.toISOString();
    const some: Practice = { ratings: { [d.questions[0].q]: { rating: 'could', at } }, ticks: Object.fromEntries(d.checklist.slice(0, 10).map((k) => [k.text, at])) };
    // round(100 × (1 / 3 + 10 / 20) / 2) = 42
    expect(practiceView(d, some).readiness).toBe(42);
    // Every line ticked, and no card rated, is half way.
    expect(practiceView(d, { ratings: {}, ticks: Object.fromEntries(d.checklist.map((k) => [k.text, at])) }).readiness).toBe(50);
    // With no checklist, only the cards count; with no cards, only the checklist.
    expect(practiceView(storedDefense({ checklist: [] }), some).readiness).toBe(33);
    expect(practiceView(storedDefense({ questions: [] }), some).readiness).toBe(50);
  });

  it('clears a rating with null, and unticks a line', async () => {
    const dir = await seed();
    await ratePractice(dir, { defenseId: 'w-test', questionId: 'q1', rating: 'shaky', now: T1 });
    await tickPractice(dir, { defenseId: 'w-test', checklistId: 'k20', ticked: true, now: T1 });
    expect(await ratePractice(dir, { defenseId: 'w-test', questionId: 'q1', rating: null, now: T2 })).toMatchObject({ ratings: {}, ticks: ['k20'] });
    expect(await tickPractice(dir, { defenseId: 'w-test', checklistId: 'k20', ticked: false, now: T2 })).toMatchObject({ ticks: [], readiness: 0 });
    expect(await readPractice(dir)).toEqual(EMPTY);
  });

  it("refuses a defense that changed since the page loaded, and a card or line it doesn't have", async () => {
    const dir = await seed();
    const stale = await failure(ratePractice(dir, { defenseId: 'w-older', questionId: 'q1', rating: 'could' }));
    expect(stale).toBeInstanceOf(ConflictError);
    expect((stale as Error).message).toBe('The Whiteboard Defense changed since this page loaded. Reload it.');
    await expect(tickPractice(dir, { defenseId: 'w-older', checklistId: 'k1', ticked: true })).rejects.toThrow('The Whiteboard Defense changed since this page loaded. Reload it.');
    const missing = await failure(ratePractice(dir, { defenseId: 'w-test', questionId: 'q9', rating: 'could' }));
    expect(missing).toBeInstanceOf(InputError);
    expect((missing as Error).message).toBe("That part of the Whiteboard Defense doesn't exist.");
    await expect(tickPractice(dir, { defenseId: 'w-test', checklistId: 'k99', ticked: true })).rejects.toThrow("That part of the Whiteboard Defense doesn't exist.");
    await expect(ratePractice(await seedProject(), { defenseId: 'w-test', questionId: 'q1', rating: 'could' })).rejects.toThrow("There's no Whiteboard Defense yet.");
    expect(await readPractice(dir)).toEqual(EMPTY);
  });

  it('keeps what still applies after a regenerate, and drops the rest on the next write', async () => {
    const first = storedDefense();
    const dir = await seed(first);
    for (const q of first.questions) await ratePractice(dir, { defenseId: 'w-test', questionId: q.id, rating: 'could', now: T1 });
    for (const id of ['k1', 'k2', 'k3']) await tickPractice(dir, { defenseId: 'w-test', checklistId: id, ticked: true, now: T1 });

    // Regenerated: the same 20 checklist lines, and the first question asked differently.
    const changed = 'What happens when the email provider is down?';
    const second = storedDefense({ id: 'w-again', questions: [{ ...first.questions[0], q: changed }, ...first.questions.slice(1)] });
    await writeDefense(dir, second);
    expect(practiceView(second, await readPractice(dir))).toMatchObject({
      ratings: { q2: 'could', q3: 'could' },
      ticks: ['k1', 'k2', 'k3'],
      counts: { could: 2, unrated: 1, ticked: 3 },
    });

    // The old first question's rating is still in the file until practice is written for the new defense.
    expect(Object.keys((await readPractice(dir)).ratings)).toContain(first.questions[0].q);
    await ratePractice(dir, { defenseId: 'w-again', questionId: 'q1', rating: 'shaky', now: T2 });
    expect((await readPractice(dir)).ratings).toEqual({
      [changed]: { rating: 'shaky', at: T2.toISOString() },
      [first.questions[1].q]: { rating: 'could', at: T1.toISOString() },
      [first.questions[2].q]: { rating: 'could', at: T1.toISOString() },
    });

    // A checklist line the next defense doesn't have goes too.
    const third = storedDefense({ id: 'w-third', checklist: first.checklist.slice(1) });
    await writeDefense(dir, third);
    await tickPractice(dir, { defenseId: 'w-third', checklistId: 'k4', ticked: true, now: T2 });
    expect(Object.keys((await readPractice(dir)).ticks)).toEqual([first.checklist[1].text, first.checklist[2].text, first.checklist[3].text]);
  });
});
