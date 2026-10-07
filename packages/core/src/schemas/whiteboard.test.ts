import { describe, expect, it } from 'vitest';
import { storedDefense, validDefenseInput } from '../../test/fixtures';
import {
  BASIS_LABELS,
  DEFENSE_PARTS,
  DEFENSE_SECTIONS,
  defenseInputSchema,
  LEVEL_NAMES,
  practiceSchema,
  sectionIds,
  SEVERITY_LABELS,
  whiteboardDefenseSchema,
  whiteboardRequestSchema,
} from './whiteboard';

/** The paths of the problems the input schema finds, joined by dots, or [] when it accepts the value. */
const problemPaths = (value: unknown) => {
  const r = defenseInputSchema.safeParse(value);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
};

describe('the Whiteboard Defense schemas', () => {
  it('has ten prose sections, numbered 1–9 and 12 among the 13', () => {
    expect(DEFENSE_SECTIONS).toHaveLength(10);
    expect(DEFENSE_SECTIONS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 12]);
    expect(sectionIds).toEqual(['summary', 'diagram', 'walkthrough', 'data', 'security', 'failure', 'tradeoffs', 'complexity', 'readiness', 'unknowns']);
    expect(DEFENSE_SECTIONS.map((s) => s.title)).toEqual([
      'Executive summary',
      'Whiteboard diagram',
      'System walkthrough',
      'Data and state',
      'Security model',
      'Failure analysis',
      'Dependencies and tradeoffs',
      'Complexity review',
      'Production readiness',
      'Unknowns',
    ]);
    expect(DEFENSE_PARTS).toEqual({
      questions: { n: 10, title: 'Questions the engineer should be able to answer' },
      concerns: { n: 11, title: 'Release concerns' },
      checklist: { n: 13, title: 'Checklist' },
    });
    expect(Object.values(LEVEL_NAMES)).toEqual(['Lightweight', 'Standard', 'High risk']);
    expect(Object.values(BASIS_LABELS)).toEqual(['Known', 'Inferred', 'Unknown', 'Verify before release']);
    expect(Object.values(SEVERITY_LABELS)).toEqual(['Critical', 'High', 'Medium', 'Low', 'Informational']);
  });

  it("accepts a whole defense from the whiteboard subagent, trimming what's written", () => {
    const input = validDefenseInput();
    expect(defenseInputSchema.parse(input)).toEqual(input);
    expect(input.sections.map((s) => s.id)).toEqual(sectionIds);
    expect(input.sections.find((s) => s.id === 'security')?.claims[1]).toEqual({ text: 'Whether the unsubscribe link needs a signed token.', basis: 'unknown' });
    expect(input.sections.find((s) => s.id === 'data')?.tables).toHaveLength(1);
    expect(input.questions).toHaveLength(3);
    expect(input.concerns.map((c) => c.severity)).toEqual(['high', 'info']);
    expect(input.checklist).toHaveLength(20);
    expect(input.checklist[0]).toBe('I can explain the purpose.');
    expect(defenseInputSchema.parse({ ...input, levelReasons: ['  It emails customers.  '] }).levelReasons).toEqual(['It emails customers.']);
  });

  it("refuses an unknown basis, a level 4 and a section that isn't one of the ten, and takes an empty checklist", () => {
    const input = validDefenseInput();
    expect(problemPaths({ ...input, level: 4 })).toEqual(['level']);
    const maybe = input.sections.map((s) => (s.id === 'security' ? { ...s, claims: [s.claims[0], { text: 'Tokens expire.', basis: 'maybe' }] } : s));
    expect(problemPaths({ ...input, sections: maybe })).toEqual(['sections.4.claims.1.basis']);
    expect(problemPaths({ ...input, sections: [...input.sections, { id: 'rollout', claims: [{ text: 'Behind a flag.', basis: 'known' }] }] })).toEqual(['sections.10.id']);
    // The service copies the rules file's checklist, so the subagent may send none.
    expect(problemPaths({ ...input, questions: [], checklist: [] })).toEqual(['questions']);
  });

  it('round-trips a stored defense', () => {
    const defense = storedDefense({ exportedTo: { clone: '~/Source/acme', path: 'docs/specs/restock.whiteboard-defense.md', at: '2026-10-06T10:00:00.000Z' } });
    expect(whiteboardDefenseSchema.parse(JSON.parse(JSON.stringify(defense)))).toEqual(defense);
    expect(defense.sections.map((s) => s.title)).toEqual(DEFENSE_SECTIONS.map((s) => s.title));
    expect(defense.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
    expect(defense.concerns.map((c) => [c.id, c.severity])).toEqual([['c1', 'high'], ['c2', 'info']]);
    expect(defense.checklist.map((k) => k.id)).toEqual(Array.from({ length: 20 }, (_, i) => `k${i + 1}`));
    expect(storedDefense()).toMatchObject({ id: 'w-test', basedOn: { kind: 'plan', doc: 'draft', version: 1, inputsHash: 'test' } });
    expect(storedDefense().exportedTo).toBeUndefined();
    expect(whiteboardDefenseSchema.safeParse({ ...defense, basedOn: { ...defense.basedOn, doc: 'original' } }).success).toBe(false);
  });

  it('keeps one request, in one of three states', () => {
    const request = { id: 'g-1', state: 'writing', requestedAt: '2026-10-06T09:00:00.000Z', pickedUpBy: 'w-a', basedOn: { doc: 'final', version: 2 } };
    expect(whiteboardRequestSchema.parse(request)).toEqual(request);
    expect(whiteboardRequestSchema.safeParse({ ...request, state: 'proposed' }).success).toBe(false);
  });

  it('starts practice with no ratings and no ticks', () => {
    expect(practiceSchema.parse({})).toEqual({ ratings: {}, ticks: {} });
    expect(practiceSchema.parse({ ticks: { 'I can explain the purpose.': '2026-10-06T09:00:00.000Z' } }).ratings).toEqual({});
    expect(practiceSchema.safeParse({ ratings: { 'Where does the renewal date come from?': { rating: 'maybe', at: '2026-10-06T09:00:00.000Z' } } }).success).toBe(false);
  });
});
