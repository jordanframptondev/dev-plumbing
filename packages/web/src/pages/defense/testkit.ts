// Helpers for the Whiteboard Defense page's component tests. Only test files import this.
import type { DefenseLink, PracticeView, Presenter, WhiteboardDefense, WhiteboardView } from '@dev-plumbing/core/schemas';

export const AT = '2026-10-06T09:00:00.000Z';
export const EXPORT_PATH = 'docs/specs/restock-reminders.whiteboard-defense.md';

type Section = WhiteboardDefense['sections'][number];
const section = (id: Section['id'], title: string, claims: Section['claims'], over: Partial<Section> = {}): Section => ({
  id,
  title,
  claims,
  tables: [],
  diagram: null,
  diagramItemId: null,
  ...over,
});

/**
 * A saved defense, overridden as needed. Security model has an Inferred claim and an Unknown one (security.1),
 * Failure analysis a Verify before release one, Data and state a table and Whiteboard diagram a text diagram.
 * Three questions, a high concern (c1) and an informational one (c2), and four checklist lines.
 */
export function defense(over: Partial<WhiteboardDefense> = {}): WhiteboardDefense {
  return {
    id: 'w-1',
    generatedAt: AT,
    basedOn: { kind: 'plan', doc: 'draft', version: 1, inputsHash: 'h'.repeat(64) },
    level: 2,
    levelReasons: ['It sends messages to customers.', 'It adds a daily job.'],
    sections: [
      section('summary', 'Executive summary', [{ text: 'A daily job reminds customers before an item runs out.', basis: 'known' }]),
      section('diagram', 'Whiteboard diagram', [{ text: 'The job reads subscriptions and sends by SMS.', basis: 'inferred' }], { diagram: 'job --> sms' }),
      section('walkthrough', 'System walkthrough', [{ text: 'The job runs at 9:00 and picks due subscriptions.', basis: 'known' }]),
      section('data', 'Data and state', [{ text: 'Each reminder sent is a row.', basis: 'known' }], {
        tables: [{ title: 'Source of truth', columns: ['Data', 'Owner'], rows: [['Reminders', 'reminders table'], ['Opt-outs', 'SMS provider']] }],
      }),
      section('security', 'Security model', [
        { text: 'Only the job sends reminders.', basis: 'inferred' },
        { text: 'Who can change the lead time.', basis: 'unknown' },
      ]),
      section('failure', 'Failure analysis', [{ text: 'A second run would send every reminder again.', basis: 'verify' }]),
      section('tradeoffs', 'Dependencies and tradeoffs', [{ text: 'SMS needs a provider account.', basis: 'known' }]),
      section('complexity', 'Complexity review', [{ text: 'One job and one table.', basis: 'known' }]),
      section('readiness', 'Production readiness', [{ text: 'Sends are logged.', basis: 'inferred' }]),
      section('unknowns', 'Unknowns', [{ text: 'How many customers opt out of SMS.', basis: 'unknown' }]),
    ],
    questions: [
      { id: 'q1', q: 'What happens if the job runs twice?', a: 'Every reminder goes out again, so it needs a sent marker.', basis: 'inferred' },
      { id: 'q2', q: 'Where is a reminder recorded?', a: 'In the reminders table.', basis: 'known' },
      { id: 'q3', q: 'Who can change the lead time?', a: 'Not decided yet.', basis: 'unknown' },
    ],
    concerns: [
      { id: 'c1', severity: 'high', text: 'A double run spams customers.', basis: 'verify' },
      { id: 'c2', severity: 'info', text: 'SMS costs grow with customers.', basis: 'inferred' },
    ],
    checklist: [
      { id: 'k1', text: 'I can draw the system from memory.' },
      { id: 'k2', text: 'I can explain the data flow.' },
      { id: 'k3', text: 'I know the source of truth.' },
      { id: 'k4', text: 'I know what breaks first.' },
    ],
    ...over,
  };
}

type PresentChapter = Presenter['chapters'][number];
const chapter = (id: PresentChapter['id'], title: string, drawing: PresentChapter['drawing'], steps: PresentChapter['steps']): PresentChapter => ({ id, title, drawing, steps });
const say = (caption: string, reveal: string[] = [], notes: PresentChapter['steps'][number]['notes'] = []) => ({ caption, reveal, notes });

/**
 * A presenter for defense(), its chapters overridden as needed. Purpose draws nothing and has a note for the whole
 * board; System flow draws the architecture-system diagram in three steps, the second adding a line and a seal note
 * near its end; Data and source of truth draws the tables; the rest draw nothing, one step each.
 */
export function presenter(over: Partial<Record<PresentChapter['id'], Partial<PresentChapter>>> = {}): Presenter {
  const chapters = [
    chapter('purpose', 'Purpose', null, [say('A daily job reminds customers before an item runs out.', [], [{ near: '', text: 'One job, one table.', ink: 'ink' }])]),
    chapter('flow', 'System flow', { kind: 'diagram', itemId: 'architecture-system' }, [
      say('The job runs every morning.', ['node:job']),
      say('It sends each reminder by SMS.', ['edge:sends'], [{ near: 'node:sms', text: 'Runs twice? One a day per subscription.', ink: 'seal' }]),
      say("That's the whole flow."),
    ]),
    chapter('data', 'Data and source of truth', { kind: 'tables' }, [say('Each reminder sent is a row.', ['table:RestockReminder'])]),
    chapter('states', 'States', null, [say("A reminder is due, then sent. This plan doesn't add other states.")]),
    chapter('security', 'Security', null, [say('Only the job sends reminders.')]),
    chapter('failure', 'Failure and retries', null, [say('A failed send is retried once, the next morning.', [], [{ near: '', text: 'No retry storm.', ink: 'moss' }])]),
    chapter('rollback', 'Rollback and blast radius', null, [say('Turn the job off; nothing else depends on it.')]),
  ];
  return { chapters: chapters.map((c) => ({ ...c, ...over[c.id] })) };
}

/** Practice before anything is rated or ticked, overridden as needed. */
export function practice(over: Partial<PracticeView> = {}): PracticeView {
  return { ratings: {}, ticks: [], readiness: 0, counts: { could: 0, shaky: 0, couldnt: 0, unrated: 3, ticked: 0, checklist: 4 }, ...over };
}

/** A thread asked about, or an item sent from, the defense. */
export function link(over: Partial<DefenseLink> = {}): DefenseLink {
  return {
    kind: 'section',
    ref: 'security',
    itemId: 'defense-who-can-change-it',
    threadId: 't-defense-who-can-change-it',
    typeId: 'defense',
    title: 'Who can change it?',
    status: 'with_claude',
    ...over,
  };
}

/** The page's data: the defense above, nothing under way, overridden as needed. */
export function view(over: Partial<WhiteboardView> = {}): WhiteboardView {
  return {
    request: null,
    defense: defense(),
    stale: null,
    practice: practice(),
    asked: [],
    sent: [],
    canGenerate: true,
    generateRefusal: null,
    listening: null,
    clones: [{ path: '/Users/you/acme-app', source: true }],
    exportPath: EXPORT_PATH,
    ...over,
  };
}

export type DefenseView = WhiteboardView & { defense: WhiteboardDefense };
/** view(), typed as Study and Practice take it. */
export const withDefense = (over: Partial<DefenseView> = {}): DefenseView => view(over) as DefenseView;
