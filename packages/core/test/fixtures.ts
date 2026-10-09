import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { writeFileAtomic, writeJsonAtomic } from '../src/atomic';
import {
  DEFENSE_SECTIONS,
  PRESENT_CHAPTERS,
  type DefenseInput,
  type Item,
  type Message,
  type Option,
  type PlumbingProject,
  type PlumbingType,
  type Thread,
  type ThreadStatus,
  type WhiteboardDefense,
} from '../src/schemas';
import { tempDir } from '../../../testkit/tmp';

export const DRAFT = [
  '# Restock reminders',
  '',
  'Remind customers before a subscription item runs out.',
  '',
  '## Approach',
  '',
  'A daily job finds subscriptions due soon and sends a reminder.',
  '',
  '## Data',
  '',
  'Log reminders in a table.',
  '',
].join('\n');

export function listType(id: string, extra: Partial<PlumbingType> = {}): PlumbingType {
  return {
    id,
    title: id[0].toUpperCase() + id.slice(1),
    order: 1,
    screen: 'list',
    emptyMessage: 'Nothing here.',
    fields: [],
    answerPresets: [],
    timeline: false,
    enabled: true,
    builtIn: false,
    file: `${id}.md`,
    body: '## Rules\n- Be brief.\n',
    sections: { Rules: '- Be brief.' },
    ...extra,
  };
}

export const TYPES: PlumbingType[] = [
  listType('architecture', { title: 'Architecture', screen: 'diagram', order: 1 }),
  listType('questions', { title: 'Questions', order: 5, fields: ['blocking', 'default'], addLabel: 'Question' }),
  listType('concerns', { title: 'Concerns', order: 6, fields: ['severity', 'likelihood'], answerPresets: ["Accept Claude's fix", 'Accept the risk'], addLabel: 'Concern' }),
];

/** An item and its thread. The thread opens with a Claude message carrying `options`, if any. */
export function pair(
  id: string,
  o: { type?: string; title?: string; status?: ThreadStatus; options?: Option[]; recommended?: string; draft?: Thread['draft']; links?: string[]; fields?: Record<string, string>; messages?: Message[] } = {},
): { item: Item; thread: Thread } {
  const item: Item = {
    id,
    type: o.type ?? 'questions',
    title: o.title ?? `Question ${id}`,
    summary: 'A summary.',
    threadId: `t-${id}`,
    createdBy: 'import',
    ...(o.links ? { links: o.links } : {}),
    ...(o.fields ? { fields: o.fields } : {}),
  };
  const opening: Message = {
    id: `m-${id}`,
    at: '2026-10-01T09:00:00.000Z',
    author: 'claude',
    text: 'Which one?',
    opening: true,
    ...(o.options ? { options: o.options } : {}),
    ...(o.recommended ? { recommended: o.recommended } : {}),
  };
  const thread: Thread = { id: `t-${id}`, itemId: id, status: o.status ?? 'your_turn', ...(o.draft ? { draft: o.draft } : {}), messages: o.messages ?? [opening] };
  return { item, thread };
}

export type Seed = { pairs?: { item: Item; thread: Thread }[]; project?: Partial<PlumbingProject>; draft?: string };

/** A plumbing project folder at <tmp>/acme/restock with the given items and threads. Returns its folder. */
export async function seedProject(seed: Seed = {}): Promise<string> {
  const dir = path.join(tempDir('dp-store-'), 'acme', 'restock');
  const project: PlumbingProject = {
    id: 'restock',
    repo: 'acme',
    title: 'Restock reminders',
    source: { path: 'docs/specs/restock.md', clone: '/tmp/acme', branch: 'main', hashAtImport: 'x' },
    clones: ['/tmp/acme'],
    docs: { original: 'docs/original.md', draft: 'docs/draft.md' },
    status: 'active',
    emptyTypes: [],
    importPending: [],
    versions: [],
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:00:00.000Z',
    ...seed.project,
  };
  await writeFileAtomic(path.join(dir, 'docs', 'original.md'), seed.draft ?? DRAFT);
  await writeFileAtomic(path.join(dir, 'docs', 'draft.md'), seed.draft ?? DRAFT);
  for (const p of seed.pairs ?? []) {
    await writeJsonAtomic(path.join(dir, 'items', `${p.item.id}.json`), p.item);
    await writeJsonAtomic(path.join(dir, 'threads', `${p.thread.id}.json`), p.thread);
  }
  await writeJsonAtomic(path.join(dir, 'project.json'), project);
  return dir;
}

/** A git repo with a remote and one plan file. Returns its real path (macOS resolves /var to /private/var). */
export function makeRepo(o: { remote?: string | null; plan?: string; planText?: string } = {}): string {
  const dir = tempDir('dp-repo-');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git('init', '-q', '-b', 'main');
  if (o.remote !== null) git('remote', 'add', 'origin', o.remote ?? 'git@github.com:acme/acme.git');
  const plan = o.plan ?? 'docs/specs/restock-reminders.md';
  fs.mkdirSync(path.dirname(path.join(dir, plan)), { recursive: true });
  fs.writeFileSync(path.join(dir, plan), o.planText ?? DRAFT);
  return fs.realpathSync(dir);
}

/** The 20 lines of the shipped outputs/whiteboard-defense.md's checklist, in order. */
const DEFENSE_CHECKLIST = [
  'I can explain the purpose.',
  'I can draw the system flow.',
  'I understand the important data.',
  'I know the source of truth for important state.',
  'I understand the state transitions.',
  'I know who can perform each operation.',
  'I understand the relevant security risks.',
  'I know the major failure modes.',
  'I know what happens if operations run twice.',
  'I understand relevant concurrency risks.',
  'I know the important dependencies.',
  'I understand the major tradeoffs.',
  'I can explain why the architecture is not unnecessarily complex.',
  'I know what the tests prove.',
  'I know how we would detect a production failure.',
  'I know how I would debug it.',
  'I understand deployment risks.',
  'I know how to recover or roll back.',
  'I understand the blast radius.',
  'I know what assumptions still need to be verified.',
];

/**
 * A whole Whiteboard Defense of the Restock reminders plan, as the whiteboard subagent sends it: all ten sections in
 * order, each with a claim (security's second claim is unknown, and data has a source-of-truth table), three questions,
 * a high and an info concern, the 20 checklist lines of the shipped rules file, and a presenter: the seven chapters in
 * order, each drawing nothing (so it's valid in any project), with one step each but two in System flow, and notes at
 * the board's foot.
 */
export function validDefenseInput(): DefenseInput {
  return {
    level: 2,
    levelReasons: ['It emails customers on a schedule.', 'It keeps no payment details, only the address it sends to.'],
    sections: [
      { id: 'summary', claims: [{ text: 'A daily job finds subscriptions about to run out and emails each customer a reminder.', basis: 'known' }] },
      { id: 'diagram', claims: [{ text: 'The job reads subscriptions from Postgres and hands each reminder to the mailer.', basis: 'inferred' }] },
      { id: 'walkthrough', claims: [{ text: 'Each morning the job picks the subscriptions due within five days, sends one email each and logs it.', basis: 'inferred' }] },
      {
        id: 'data',
        claims: [{ text: 'Each reminder sent is logged as a row in a reminders table.', basis: 'known' }],
        tables: [{ title: 'Source of truth', columns: ['State', 'Owner'], rows: [['Renewal date', 'Billing'], ['Reminders sent', 'The reminders table']] }],
      },
      {
        id: 'security',
        claims: [
          { text: 'Reminders go only to the email address on the subscription.', basis: 'inferred' },
          { text: 'Whether the unsubscribe link needs a signed token.', basis: 'unknown' },
        ],
      },
      { id: 'failure', claims: [{ text: 'If the job runs twice in a day, the log stops a second email.', basis: 'verify' }] },
      { id: 'tradeoffs', claims: [{ text: 'A daily batch is simpler than an event per subscription, at the cost of up to a day of delay.', basis: 'inferred' }] },
      { id: 'complexity', claims: [{ text: 'One job and one table: nothing new to deploy.', basis: 'inferred' }] },
      { id: 'readiness', claims: [{ text: 'Nothing alerts anyone when the job fails to run.', basis: 'unknown' }] },
      { id: 'unknowns', claims: [{ text: 'How many emails a day the mail provider allows.', basis: 'unknown' }] },
    ],
    questions: [
      { q: 'What stops a customer getting two reminders?', a: 'The reminders table: the job skips a subscription it already logged that day.', basis: 'verify' },
      { q: 'Where does the renewal date come from?', a: 'Billing owns it; the job only reads it.', basis: 'inferred' },
      { q: 'What happens when the mailer is down?', a: 'The send fails, and the next run tries again.', basis: 'unknown' },
    ],
    concerns: [
      { severity: 'high', text: 'A job that runs twice could email every customer twice.', basis: 'verify' },
      { severity: 'info', text: "The reminder copy isn't final yet.", basis: 'known' },
    ],
    checklist: [...DEFENSE_CHECKLIST],
    presenter: {
      chapters: [
        {
          id: 'purpose',
          drawing: null,
          steps: [{ caption: 'Customers run out before they reorder, so a daily job reminds them a few days ahead.', reveal: [], notes: [{ near: '', text: 'one reminder per subscription', ink: 'ink' }] }],
        },
        {
          id: 'flow',
          drawing: null,
          steps: [
            { caption: 'Each morning the job reads the subscriptions due within five days.', reveal: [], notes: [] },
            { caption: 'It hands each reminder to the mailer and logs it.', reveal: [], notes: [{ near: '', text: 'runs twice? → the log stops a second email', ink: 'seal' }] },
          ],
        },
        {
          id: 'data',
          drawing: null,
          steps: [{ caption: 'Billing owns the renewal date; the reminders table records what was sent.', reveal: [], notes: [{ near: '', text: 'source of truth: the reminders table', ink: 'slate' }] }],
        },
        { id: 'states', drawing: null, steps: [{ caption: 'A subscription is not due yet, due, or reminded today.', reveal: [], notes: [] }] },
        {
          id: 'security',
          drawing: null,
          steps: [{ caption: 'Reminders go only to the address on the subscription.', reveal: [], notes: [{ near: '', text: 'unsubscribe token? not decided', ink: 'seal' }] }],
        },
        { id: 'failure', drawing: null, steps: [{ caption: 'When the mailer is down the send fails, and the next run tries again.', reveal: [], notes: [] }] },
        {
          id: 'rollback',
          drawing: null,
          steps: [{ caption: 'Turn the job off: nothing else depends on it.', reveal: [], notes: [{ near: '', text: 'blast radius: reminder emails only', ink: 'moss' }] }],
        },
      ],
    },
  };
}

/**
 * validDefenseInput() as saveDefense saves it: the section titles, ids q1–q3, c1–c2 (the high concern first) and
 * k1–k20, the presenter's chapter titles, id w-test, and based on the draft at v1. `overrides` replace whole fields.
 */
export function storedDefense(overrides: Partial<WhiteboardDefense> = {}): WhiteboardDefense {
  const input = validDefenseInput();
  return {
    id: 'w-test',
    generatedAt: '2026-10-06T09:00:00.000Z',
    basedOn: { kind: 'plan', doc: 'draft', version: 1, inputsHash: 'test' },
    level: input.level,
    levelReasons: input.levelReasons,
    sections: input.sections.map((s) => ({
      id: s.id,
      title: DEFENSE_SECTIONS.find((d) => d.id === s.id)!.title,
      claims: s.claims,
      tables: s.tables ?? [],
      diagram: null,
      diagramItemId: null,
    })),
    questions: input.questions.map((q, i) => ({ id: `q${i + 1}`, ...q })),
    concerns: input.concerns.map((c, i) => ({ id: `c${i + 1}`, ...c })),
    checklist: input.checklist.map((text, i) => ({ id: `k${i + 1}`, text })),
    presenter: {
      chapters: PRESENT_CHAPTERS.map(({ id, title }) => {
        const c = input.presenter!.chapters.find((chapter) => chapter.id === id)!;
        return { id, title, drawing: c.drawing, steps: c.steps };
      }),
    },
    ...overrides,
  };
}
