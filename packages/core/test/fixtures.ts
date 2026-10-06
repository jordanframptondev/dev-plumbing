import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { writeFileAtomic, writeJsonAtomic } from '../src/atomic';
import type { Item, Message, Option, PlumbingProject, PlumbingType, Thread, ThreadStatus } from '../src/schemas';
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
