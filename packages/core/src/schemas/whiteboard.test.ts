import { describe, expect, it } from 'vitest';
import { storedDefense, validDefenseInput } from '../../test/fixtures';
import {
  BASIS_LABELS,
  chapterIds,
  DEFENSE_PARTS,
  DEFENSE_SECTIONS,
  defenseInputSchema,
  LEVEL_NAMES,
  MAX_PRESENTER_CHARS,
  noteInkValues,
  practiceSchema,
  PRESENT_CHAPTERS,
  presenterInputSchema,
  presenterSchema,
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

  it('has seven Present chapters in order, four inks for notes, and a presenter of at most 20,000 characters', () => {
    expect(PRESENT_CHAPTERS.map((c) => [c.id, c.title])).toEqual([
      ['purpose', 'Purpose'],
      ['flow', 'System flow'],
      ['data', 'Data and source of truth'],
      ['states', 'States'],
      ['security', 'Security'],
      ['failure', 'Failure and retries'],
      ['rollback', 'Rollback and blast radius'],
    ]);
    expect(chapterIds).toEqual(['purpose', 'flow', 'data', 'states', 'security', 'failure', 'rollback']);
    expect(noteInkValues).toEqual(['ink', 'slate', 'seal', 'moss']);
    expect(MAX_PRESENTER_CHARS).toBe(20_000);
    expect(validDefenseInput().presenter!.chapters.map((c) => c.id)).toEqual(chapterIds);
  });

  it("takes a presenter's chapters, drawings and steps, trimming what's written, and refuses what's past its limits", () => {
    const chapter = (over: Record<string, unknown> = {}) => ({ id: 'flow', drawing: null, steps: [{ caption: 'It runs daily.', reveal: [] }], ...over });
    const step = (over: Record<string, unknown> = {}) => ({ caption: 'It runs daily.', reveal: [], ...over });
    // Notes default to none; captions and notes are trimmed; a drawing is a diagram item, the tables, a flow or null.
    const parsed = presenterInputSchema.parse({
      chapters: [
        chapter({ steps: [step({ caption: '  It runs daily.  ', reveal: ['node:job'], notes: [{ near: 'node:job', text: ' once a day ', ink: 'seal' }] }), step({ caption: 'Then it sends.' })] }),
        chapter({ drawing: { kind: 'diagram', itemId: 'architecture-system' } }),
        chapter({ drawing: { kind: 'tables', itemId: 'database-reminder' } }),
        chapter({ drawing: { kind: 'flow', itemId: 'flows-send' } }),
      ],
    });
    expect(parsed.chapters[0].steps).toEqual([
      { caption: 'It runs daily.', reveal: ['node:job'], notes: [{ near: 'node:job', text: 'once a day', ink: 'seal' }] },
      { caption: 'Then it sends.', reveal: [], notes: [] },
    ]);
    expect(parsed.chapters.map((c) => c.drawing)).toEqual([null, { kind: 'diagram', itemId: 'architecture-system' }, { kind: 'tables' }, { kind: 'flow', itemId: 'flows-send' }]);
    // Any chapter id is taken here: saveDefense says which are missing, doubled or out of order.
    expect(presenterInputSchema.safeParse({ chapters: [chapter({ id: 'intro' })] }).success).toBe(true);

    const input = validDefenseInput();
    const paths = (...chapters: unknown[]) => problemPaths({ ...input, presenter: { chapters } });
    const note = { near: '', text: 'Careful.', ink: 'seal' };
    expect(paths(chapter({ steps: [] }))).toEqual(['presenter.chapters.0.steps']);
    expect(paths(chapter({ steps: Array.from({ length: 9 }, () => step()) }))).toEqual(['presenter.chapters.0.steps']);
    expect(paths(chapter({ drawing: { kind: 'mockup', itemId: 'ui-card' } }))).toEqual(['presenter.chapters.0.drawing']);
    expect(paths(chapter({ drawing: { kind: 'diagram' } }))).toEqual(['presenter.chapters.0.drawing']);
    expect(paths(chapter({ drawing: undefined }))).toEqual(['presenter.chapters.0.drawing']);
    expect(paths(chapter({ steps: [step({ caption: '  ' })] }))).toEqual(['presenter.chapters.0.steps.0.caption']);
    expect(paths(chapter({ steps: [step({ caption: 'x'.repeat(301) })] }))).toEqual(['presenter.chapters.0.steps.0.caption']);
    expect(paths(chapter({ steps: [step({ reveal: Array.from({ length: 41 }, (_, i) => `node:n${i}`) })] }))).toEqual(['presenter.chapters.0.steps.0.reveal']);
    expect(paths(chapter({ steps: [step({ notes: [note, note, note, note, note] })] }))).toEqual(['presenter.chapters.0.steps.0.notes']);
    expect(paths(chapter({ steps: [step({ notes: [{ ...note, text: 'x'.repeat(121) }] })] }))).toEqual(['presenter.chapters.0.steps.0.notes.0.text']);
    expect(paths(chapter({ steps: [step({ notes: [{ ...note, near: 'x'.repeat(121) }] })] }))).toEqual(['presenter.chapters.0.steps.0.notes.0.near']);
    expect(paths(chapter({ steps: [step({ notes: [{ ...note, ink: 'red' }] })] }))).toEqual(['presenter.chapters.0.steps.0.notes.0.ink']);
    expect(paths(...Array.from({ length: 11 }, () => chapter()))).toEqual(['presenter.chapters']);
    // A missing presenter is saveDefense's own line, so the schema takes a defense without one.
    const { presenter: _presenter, ...without } = input;
    expect(problemPaths(without)).toEqual([]);
  });

  it('reads a stored defense with its presenter, and one saved before Present without one', () => {
    const defense = storedDefense();
    expect(defense.presenter!.chapters.map((c) => c.title)).toEqual(PRESENT_CHAPTERS.map((c) => c.title));
    expect(whiteboardDefenseSchema.parse(JSON.parse(JSON.stringify(defense)))).toEqual(defense);
    const { presenter: _presenter, ...old } = defense;
    const parsed = whiteboardDefenseSchema.parse(JSON.parse(JSON.stringify(old)));
    expect(parsed).toEqual(old);
    expect(parsed.presenter).toBeUndefined();
    // A stored chapter is one of the seven.
    expect(presenterSchema.safeParse({ chapters: [{ id: 'intro', title: 'Intro', drawing: null, steps: [] }] }).success).toBe(false);
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
