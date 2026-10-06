import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

// The writer fails on the calls a test names ("file#n", counting from 1 since the test cleared the counts), so a test
// can make the update fail part-way, and make putting a file back fail too.
const failing = vi.hoisted(() => ({ calls: new Set<string>(), counts: new Map<string, number>() }));
vi.mock('../src/atomic', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/atomic')>();
  const writeFileAtomic = (file: string, data: string | Uint8Array, mode?: number) => {
    const n = (failing.counts.get(file) ?? 0) + 1;
    failing.counts.set(file, n);
    if (failing.calls.has(`${file}#${n}`)) return Promise.reject(new Error('No space left on device'));
    return actual.writeFileAtomic(file, data, mode);
  };
  return { ...actual, writeFileAtomic, writeJsonAtomic: (file: string, value: unknown) => writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`) };
});

// mergePlan throws MergeError while a test sets `merging.fail`, as it does when git is missing or times out.
const merging = vi.hoisted(() => ({ fail: null as string | null }));
vi.mock('../src/merge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/merge')>();
  return {
    ...actual,
    mergePlan: (o: Parameters<typeof actual.mergePlan>[0]) => (merging.fail ? Promise.reject(new actual.MergeError(merging.fail)) : actual.mergePlan(o)),
  };
});

// Reading a file a test names fails with EMFILE while it's in `reading.fail`, as it does when the service has too many
// files open: an error that says nothing about whether the file is there.
const reading = vi.hoisted(() => ({ fail: new Set<string>() }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises') & { default: typeof import('node:fs/promises') }>();
  const readFile = ((file: unknown, ...rest: unknown[]) =>
    typeof file === 'string' && reading.fail.has(file)
      ? Promise.reject(Object.assign(new Error(`EMFILE: too many open files, open '${file}'`), { code: 'EMFILE' }))
      : (actual.readFile as (...args: unknown[]) => Promise<unknown>)(file, ...rest)) as typeof actual.readFile;
  return { ...actual, readFile, default: { ...actual.default, readFile } };
});

import { PLAN_CHANGES_TYPE } from '../src/planChanges';
import type { PlumbingProject } from '../src/schemas';
import { pickUpFinalize, requestFinalize } from '../src/store/finalize';
import { ConflictError, InputError, readItem, readItems, readProjectFile, readSubmissions, readThread, readThreads, writeProjectFile } from '../src/store/io';
import { finishSubmission, pendingSubmissions, pickUp } from '../src/store/queue';
import { planChange, recoverUnfinishedUpdate, updatePlan } from '../src/store/update';
import { planHash, snapshotVersion } from '../src/store/versions';
import { removeTempDirs } from '../../../testkit/tmp';
import { DRAFT, listType, pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const T = new Date('2026-10-05T10:00:00.000Z');
const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const types = [...TYPES, listType('ideas', { title: 'Ideas', order: 7, enabled: false }), PLAN_CHANGES_TYPE];
const IMPORTABLE = ['architecture', 'questions', 'concerns'];
const update = (dir: string, repoText: string, o: { fresh?: boolean; now?: Date } = {}) =>
  updatePlan(dir, { repoText, clone: '/Users/you/src/acme', branch: 'restock-v2', commit: COMMIT, types, home: '/Users/you', now: o.now ?? T, ...(o.fresh ? { fresh: true } : {}) });

/** Your draft: an edit to the Approach section. */
const OURS = DRAFT.replace('sends a reminder.', 'sends an email reminder.');
/** The repo's new version: a new title and an edit to the Data section, neither of which your draft touched. */
const CLEAN = DRAFT.replace('# Restock reminders', '# Restock reminders, take two').replace('Log reminders in a table.', 'Log each reminder in a reminders table.');
/** The repo's new version: the same Approach line your draft edited, edited differently, and the Data section. */
const CONFLICTING = DRAFT.replace('sends a reminder.', 'sends a text message.').replace('Log reminders in a table.', 'Log each reminder in a reminders table.');
const FIRST_LINE = "Your draft and the repo's v2 both changed this passage. Claude is proposing a merged version.";
const NOTHING_TO_SETTLE = { conflicts: 0, whitespaceOnly: false, suggestFresh: false };

/** A project imported from DRAFT (v1), with `draft` (OURS unless given) as its draft. */
async function seed(o: { draft?: string; original?: string; project?: Partial<PlumbingProject>; pairs?: ReturnType<typeof pair>[] } = {}): Promise<string> {
  const original = o.original ?? DRAFT;
  const dir = await seedProject({
    pairs: o.pairs,
    draft: original,
    project: { source: { path: 'docs/specs/restock.md', clone: '/tmp/acme', branch: 'main', hashAtImport: planHash(original) }, ...o.project },
  });
  await fs.writeFile(path.join(dir, 'docs', 'draft.md'), o.draft ?? OURS);
  return dir;
}

/** Every file and folder under dir, with each file's text. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const walk = async (folder: string): Promise<void> => {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const p = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        out[p] = 'folder';
        await walk(p);
      } else {
        out[p] = await fs.readFile(p, 'utf8');
      }
    }
  };
  await walk(dir);
  return out;
}

const read = (dir: string, rel: string) => fs.readFile(path.join(dir, rel), 'utf8');
const failure = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);

describe('a change to the plan', () => {
  it('is null when the repo has the version the project is at', async () => {
    const dir = await seed();
    expect(await planChange(dir, DRAFT)).toBeNull();
  });

  it('is null when only the line endings changed', async () => {
    const dir = await seed();
    expect(await planChange(dir, DRAFT.replace(/\n/g, '\r\n'))).toBeNull();
  });

  it('counts the lines added and removed since the current version', async () => {
    const dir = await seed();
    expect(await planChange(dir, `${CLEAN}\n## Channels\n\nSend by SMS.\n`)).toEqual({ from: 1, to: 2, added: 6, removed: 2, ...NOTHING_TO_SETTLE });
  });

  it('says when merging would leave much of the draft to settle, or only the formatting changed', async () => {
    const channels = 'Send by email first, then by SMS to customers who opted in. Never more than one reminder a day. '.repeat(4).trim();
    const plan = `${DRAFT}\n## Channels\n\n${channels}\n`;
    const dir = await seed({ original: plan, draft: plan.replace('sends a reminder.', 'sends an email reminder.') });
    // One short passage in conflict: merging suits.
    expect(await planChange(dir, plan.replace('sends a reminder.', 'sends a text message.'))).toEqual({ from: 1, to: 2, added: 1, removed: 1, conflicts: 1, whitespaceOnly: false, suggestFresh: false });
    // Only the line breaks changed.
    expect(await planChange(dir, plan.replace(/\. Never/g, '.\nNever'))).toEqual({ from: 1, to: 2, added: 5, removed: 1, conflicts: 0, whitespaceOnly: true, suggestFresh: true });
    // The repo rewrote what your draft changed, and the long Channels paragraph you changed too.
    await fs.writeFile(path.join(dir, 'docs', 'draft.md'), plan.replace('sends a reminder.', 'sends an email reminder.').replace(channels, `${channels} Pause them on request.`));
    const rewrite = plan.replace('sends a reminder.', 'sends a text message.').replace(channels, 'Send by push only.');
    expect(await planChange(dir, rewrite)).toMatchObject({ conflicts: 2, whitespaceOnly: false, suggestFresh: true });
  });

  it('is the older version when this clone has one the project had before', async () => {
    const dir = await seed();
    await update(dir, CLEAN);
    expect(await planChange(dir, DRAFT)).toEqual({ older: 1 });
    expect(await planChange(dir, DRAFT.replace(/\n/g, '\r\n'))).toEqual({ older: 1 });
  });

  it('is counted from the latest version once there is one', async () => {
    const dir = await seed();
    await update(dir, CLEAN);
    expect(await planChange(dir, CLEAN)).toBeNull();
    expect(await planChange(dir, CLEAN.replace('a reminders table', 'the reminder log'))).toEqual({ from: 2, to: 3, added: 1, removed: 1, ...NOTHING_TO_SETTLE });
  });
});

describe('bringing a new version in', () => {
  it('saves v1, merges both sides into the draft, and starts the re-import', async () => {
    // A window from the first import is still on record: the re-import is handed out afresh.
    const dir = await seed({ pairs: [pair('q1')], project: { importBy: 'w-first' } });
    expect(await update(dir, CLEAN)).toEqual({ version: 2, clean: 2, conflicts: 0, fresh: false, conflictThreadIds: [], importTypes: IMPORTABLE });
    expect(await read(dir, 'docs/versions/v1/original.md')).toBe(DRAFT);
    expect(await read(dir, 'docs/versions/v1/draft.md')).toBe(OURS);
    expect(await read(dir, 'docs/versions/v1/items/q1.json')).toBe(await read(dir, 'items/q1.json'));
    const merged = CLEAN.replace('sends a reminder.', 'sends an email reminder.');
    expect(await read(dir, 'docs/draft.md')).toBe(merged);
    // The draft as the update left it, kept for the version's page.
    expect(await read(dir, 'docs/versions/v2/merged.md')).toBe(merged);
    expect(await read(dir, 'docs/original.md')).toBe(CLEAN);
    // The journal is gone once the update is in.
    expect(await fs.readdir(path.join(dir, 'docs', 'versions', 'v1'))).toEqual(['draft.md', 'items', 'original.md']);
    const project = await readProjectFile(dir);
    expect(project.versions).toEqual([
      { n: 1, at: '2026-10-01T09:00:00.000Z', hash: planHash(DRAFT), clone: '/tmp/acme', branch: 'main', commit: null },
      { n: 2, at: T.toISOString(), hash: planHash(CLEAN), clone: '~/src/acme', branch: 'restock-v2', commit: COMMIT, merge: { clean: 2, conflicts: 0 } },
    ]);
    expect(project).toMatchObject({
      title: 'Restock reminders, take two',
      status: 'importing',
      importPending: IMPORTABLE,
      reimporting: { version: 2, from: 'active' },
      updatedAt: T.toISOString(),
    });
    expect(project.importBy).toBeUndefined();
    expect((await readItems(dir)).values.map((i) => i.id)).toEqual(['q1']);
    expect(await readSubmissions(dir)).toEqual([]);
  });

  it('turns a passage both sides changed into a Plan changes thread for Claude, keeping your text in the draft', async () => {
    const dir = await seed();
    expect(await update(dir, CONFLICTING)).toEqual({ version: 2, clean: 1, conflicts: 1, fresh: false, conflictThreadIds: ['t-plan-changes-v2-1'], importTypes: IMPORTABLE });
    expect(await read(dir, 'docs/draft.md')).toBe(OURS.replace('Log reminders in a table.', 'Log each reminder in a reminders table.'));
    expect(await read(dir, 'docs/versions/v2/merged.md')).toBe(await read(dir, 'docs/draft.md'));
    expect(await read(dir, 'docs/original.md')).toBe(CONFLICTING);
    expect(await readItem(dir, 'plan-changes-v2-1')).toEqual({
      id: 'plan-changes-v2-1',
      key: 'v2-1',
      type: 'plan-changes',
      title: 'Approach',
      summary: "Your draft and the repo's v2 both changed this passage.",
      body: [
        '**Your draft**',
        '',
        '```md',
        'A daily job finds subscriptions due soon and sends an email reminder.',
        '```',
        '',
        '**The repo (v2)**',
        '',
        '```md',
        'A daily job finds subscriptions due soon and sends a text message.',
        '```',
        '',
        '**Before (v1)**',
        '',
        '```md',
        'A daily job finds subscriptions due soon and sends a reminder.',
        '```',
      ].join('\n'),
      mdAnchor: { heading: 'Approach' },
      threadId: 't-plan-changes-v2-1',
      createdBy: 'import',
      conflict: {
        ours: 'A daily job finds subscriptions due soon and sends an email reminder.',
        base: 'A daily job finds subscriptions due soon and sends a reminder.',
        theirs: 'A daily job finds subscriptions due soon and sends a text message.',
      },
    });
    expect(await readThread(dir, 't-plan-changes-v2-1')).toEqual({
      id: 't-plan-changes-v2-1',
      itemId: 'plan-changes-v2-1',
      status: 'with_claude',
      messages: [{ id: expect.stringMatching(/^m-/), at: T.toISOString(), author: 'system', text: FIRST_LINE }],
    });
    const submissions = await readSubmissions(dir);
    expect(submissions).toEqual([
      { id: expect.stringMatching(/^s-/), at: T.toISOString(), scope: 'all', drafts: {}, sent: ['t-plan-changes-v2-1'], resolved: [], processedAt: T.toISOString() },
    ]);
    expect((await pendingSubmissions(dir)).map((s) => s.id)).toEqual([submissions[0].id]);
    expect((await readProjectFile(dir)).versions[1].merge).toEqual({ clean: 1, conflicts: 1 });
  });

  it('shows a passage you deleted as (nothing), and fences text with backticks in it', async () => {
    const draft = DRAFT.replace('A daily job finds subscriptions due soon and sends a reminder.\n', '');
    const dir = await seed({ draft });
    const repo = DRAFT.replace('sends a reminder.', 'runs ```sendReminders()``` each morning.');
    await update(dir, repo);
    expect(await read(dir, 'docs/draft.md')).toBe(draft);
    expect((await readItem(dir, 'plan-changes-v2-1')).body).toBe(
      [
        '**Your draft**',
        '',
        '(nothing)',
        '',
        '**The repo (v2)**',
        '',
        '````md',
        'A daily job finds subscriptions due soon and runs ```sendReminders()``` each morning.',
        '````',
        '',
        '**Before (v1)**',
        '',
        '```md',
        'A daily job finds subscriptions due soon and sends a reminder.',
        '```',
      ].join('\n'),
    );
  });

  it('says where the repo moved a passage your draft changed', async () => {
    const channels = '## Channels\n\nSend by email.\n';
    const plan = `${DRAFT}\n${channels}`;
    const dir = await seed({ original: plan, draft: plan.replace('Send by email.', 'Send by email, and by SMS to customers who opted in.') });
    // The repo moves Channels to the top, word for word.
    await update(dir, plan.replace(`\n${channels}`, '').replace('## Approach', `${channels}\n## Approach`));
    const item = await readItem(dir, 'plan-changes-v2-1');
    expect(item.title).toBe('Channels');
    expect(item.body?.split('\n\n')[0]).toBe('The repo moved this passage to § Channels. Your draft now has both copies.');
    expect((await read(dir, 'docs/draft.md')).match(/^## Channels$/gm)).toHaveLength(2);
  });

  it('names a conflict with no heading above it by its number', async () => {
    const dir = await seed({ original: 'Remind customers.\n', draft: 'Remind customers by email.\n' });
    await update(dir, 'Remind customers by SMS.\n');
    const item = await readItem(dir, 'plan-changes-v2-1');
    expect(item.title).toBe('Change 1');
    expect(item.mdAnchor).toBeUndefined();
    // The plan has no title of its own, so the project keeps its title.
    expect((await readProjectFile(dir)).title).toBe('Restock reminders');
  });

  it('takes a finalized project back to Active when the update changed its draft, and keeps it Finalized otherwise', async () => {
    const changed = await seed({ project: { status: 'finalized' } });
    await update(changed, CLEAN);
    expect(await readProjectFile(changed)).toMatchObject({ status: 'importing', reimporting: { version: 2, from: 'active' } });
    // The repo's new version says what your draft already says, so the draft stays as it was.
    const same = await seed({ project: { status: 'finalized' } });
    expect(await update(same, OURS)).toMatchObject({ clean: 0, conflicts: 0 });
    expect(await read(same, 'docs/draft.md')).toBe(OURS);
    expect(await readProjectFile(same)).toMatchObject({ status: 'importing', reimporting: { version: 2, from: 'finalized' } });
  });

  it("starts the draft again from the repo's version when asked, with nothing to settle", async () => {
    const dir = await seed({ project: { status: 'finalized' } });
    expect(await update(dir, CONFLICTING, { fresh: true })).toEqual({ version: 2, clean: 0, conflicts: 0, fresh: true, conflictThreadIds: [], importTypes: IMPORTABLE });
    expect(await read(dir, 'docs/draft.md')).toBe(CONFLICTING);
    expect(await read(dir, 'docs/versions/v2/merged.md')).toBe(CONFLICTING);
    expect(await read(dir, 'docs/versions/v1/draft.md')).toBe(OURS);
    const project = await readProjectFile(dir);
    expect(project.versions[1].merge).toEqual({ clean: 0, conflicts: 0, fresh: true });
    expect(project).toMatchObject({ status: 'importing', reimporting: { version: 2, from: 'active' } });
    expect((await readItems(dir)).values).toEqual([]);
  });

  it('parks an older Plan changes thread that a newer conflict covers, pointing at the new one', async () => {
    const dir = await seed();
    await update(dir, CONFLICTING);
    // Claude didn't get to it, and the re-import finished.
    const [queued] = await pendingSubmissions(dir);
    await pickUp(dir, queued.id, 'w-a', T);
    await finishSubmission(dir, queued.id, [], T);
    await writeProjectFile(dir, { ...(await readProjectFile(dir)), status: 'active', importPending: [], reimporting: undefined });
    // v3 changes the same line again, and your draft still has your text there.
    const T3 = new Date('2026-10-06T10:00:00.000Z');
    expect(await update(dir, CONFLICTING.replace('sends a text message.', 'sends a push message.'), { now: T3 })).toMatchObject({ version: 3, conflicts: 1, conflictThreadIds: ['t-plan-changes-v3-1'] });
    const older = await readThread(dir, 't-plan-changes-v2-1');
    expect(older.status).toBe('parked');
    expect(older.messages.at(-1)).toMatchObject({ author: 'system', text: "Superseded by the plan's v3: Approach." });
    expect((await readItem(dir, 'plan-changes-v3-1')).links).toEqual(['plan-changes-v2-1']);
    expect((await readThread(dir, 't-plan-changes-v3-1')).status).toBe('with_claude');
  });

  it("gives back a conflict thread Claude didn't get to, with no answer to restore", async () => {
    const dir = await seed();
    const { conflictThreadIds } = await update(dir, CONFLICTING);
    const [queued] = await pendingSubmissions(dir);
    await pickUp(dir, queued.id, 'w-a', T);
    expect(await finishSubmission(dir, queued.id, [], T)).toEqual({ returned: conflictThreadIds });
    const thread = await readThread(dir, conflictThreadIds[0]);
    expect(thread.status).toBe('your_turn');
    expect(thread.draft).toBeUndefined();
    expect(thread.messages.map((m) => m.text)).toEqual([FIRST_LINE, "Claude didn't get to this one. Pick Keep my draft or Take the repo's version, or say what you want, and send it."]);
  });
});

describe('when an update is refused or fails', () => {
  /** The update is refused with `message`, and the project folder is exactly as it was. */
  async function refused(dir: string, message: string): Promise<void> {
    const before = await snapshot(dir);
    const error = await failure(update(dir, CONFLICTING));
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toBe(message);
    expect(await snapshot(dir)).toEqual(before);
  }

  it('an update waits for work in progress', async () => {
    await refused(await seed({ project: { status: 'importing', importPending: ['questions'] } }), "This project is still importing. Run /dev-plumbing again once that's done.");
    await refused(
      await seed({ pairs: [pair('q1', { status: 'with_claude' }), pair('q2')] }),
      "Claude has 1 thread to answer in this project first. Run /dev-plumbing again once it's answered.",
    );
    await refused(
      await seed({ pairs: [pair('q1', { status: 'with_claude' }), pair('q2', { status: 'with_claude' })] }),
      "Claude has 2 threads to answer in this project first. Run /dev-plumbing again once they're answered.",
    );
    const requested = await seed();
    await requestFinalize(requested, { types });
    await refused(requested, "Finalize is under way. Run /dev-plumbing again once it's done or cancelled.");
    const writing = await seed();
    await requestFinalize(writing, { types });
    await pickUpFinalize(writing, 'w-a');
    await refused(writing, "Finalize is under way. Run /dev-plumbing again once it's done or cancelled.");
  });

  it("refuses a plan that hasn't changed", async () => {
    const dir = await seed();
    const before = await snapshot(dir);
    await expect(update(dir, DRAFT)).rejects.toThrow(new ConflictError("The plan hasn't changed since v1."));
    expect(await snapshot(dir)).toEqual(before);
  });

  it("refuses, writing nothing, when git can't merge", async () => {
    const dir = await seed();
    const before = await snapshot(dir);
    merging.fail = 'git merge-file timed out';
    const error = await failure(update(dir, CONFLICTING));
    merging.fail = null;
    expect(error).toBeInstanceOf(InputError);
    expect((error as Error).message).toBe("Couldn't merge the new plan: git merge-file timed out");
    expect(await snapshot(dir)).toEqual(before);
  });

  it("refuses, writing nothing, when the version it would save is already saved", async () => {
    // A copy that isn't this update's: putting the update back must never restore from it, or remove it.
    const dir = await seed();
    await fs.mkdir(path.join(dir, 'docs', 'versions', 'v1'), { recursive: true });
    await fs.writeFile(path.join(dir, 'docs', 'versions', 'v1', 'draft.md'), 'An older copy of the draft.\n');
    await refused(dir, 'Version 1 is already saved in docs/versions/v1.');
  });

  it.each([
    'docs/versions/v1/update.json',
    'docs/versions/v1/original.md',
    'docs/versions/v1/draft.md',
    'docs/versions/v1/items/q1.json',
    'items/plan-changes-v2-1.json',
    'threads/t-plan-changes-v2-1.json',
    'docs/versions/v2/merged.md',
    'docs/draft.md',
    'docs/original.md',
    'project.json',
  ])('puts the project back as it was when writing %s fails', async (rel) => {
    const dir = await seed({ pairs: [pair('q1')] });
    const before = await snapshot(dir);
    failing.counts.clear();
    failing.calls = new Set([`${path.join(dir, rel)}#1`]);
    const error = await failure(update(dir, CONFLICTING));
    failing.calls = new Set();
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toBe(
      "The update didn't finish (No space left on device). What it had written was put back, so the project is as it was. Run /dev-plumbing to try again.",
    );
    expect(await snapshot(dir)).toEqual(before);
    expect((await update(dir, CONFLICTING)).version).toBe(2);
  });

  it('an update never loses your draft', async () => {
    const dir = await seed();
    const before = await snapshot(dir);
    // project.json is written last. When it fails, the snapshot, the conflict's files, the draft and the original
    // have all been written, and all of them are put back.
    failing.counts.clear();
    failing.calls = new Set([`${path.join(dir, 'project.json')}#1`]);
    const error = await failure(update(dir, CONFLICTING));
    failing.calls = new Set();
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toBe(
      "The update didn't finish (No space left on device). What it had written was put back, so the project is as it was. Run /dev-plumbing to try again.",
    );
    expect(await snapshot(dir)).toEqual(before);

    // The same update, when nothing fails, keeps your draft from before it as v1's.
    expect((await update(dir, CONFLICTING)).version).toBe(2);
    expect(await read(dir, 'docs/versions/v1/draft.md')).toBe(OURS);
    expect(await read(dir, 'docs/versions/v1/original.md')).toBe(DRAFT);
  });

  it("finishes putting your draft back the next time, when it couldn't the first time", async () => {
    const dir = await seed();
    const before = await snapshot(dir);
    failing.counts.clear();
    failing.calls = new Set([`${path.join(dir, 'project.json')}#1`, `${path.join(dir, 'docs', 'draft.md')}#2`]);
    const error = await failure(update(dir, CONFLICTING));
    failing.calls = new Set();
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toBe(
      "The update didn't finish (No space left on device), and some files couldn't be put back yet: docs/draft.md. Run /dev-plumbing again to finish putting them back.",
    );
    // v1's copy of your draft and the journal are still there. Everything else was put back, and the conflict's
    // thread isn't left queued for Claude.
    expect(await read(dir, 'docs/versions/v1/draft.md')).toBe(OURS);
    expect(await read(dir, 'docs/original.md')).toBe(DRAFT);
    expect((await readItems(dir)).values).toEqual([]);
    expect(await pendingSubmissions(dir)).toEqual([]);
    expect(await readProjectFile(dir)).toMatchObject({ status: 'active', versions: [] });
    // The next look at the plan finishes the job, so the update can run again.
    expect(await planChange(dir, CONFLICTING)).toMatchObject({ from: 1, to: 2 });
    expect(await snapshot(dir)).toEqual(before);
    expect((await update(dir, CONFLICTING)).version).toBe(2);
  });

  it("puts your draft back from the update's own copy when the saved one can't be read", async () => {
    const dir = await seed();
    const before = await snapshot(dir);
    failing.counts.clear();
    failing.calls = new Set([`${path.join(dir, 'project.json')}#1`]);
    reading.fail = new Set(['original.md', 'draft.md'].map((f) => path.join(dir, 'docs', 'versions', 'v1', f)));
    const error = await failure(update(dir, CONFLICTING));
    failing.calls = new Set();
    reading.fail = new Set();
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toBe(
      "The update didn't finish (No space left on device). What it had written was put back, so the project is as it was. Run /dev-plumbing to try again.",
    );
    expect(await read(dir, 'docs/draft.md')).toBe(OURS);
    expect(await snapshot(dir)).toEqual(before);
  });

  it("keeps v1's copy of your draft until it can be read, when an update has to be put back later", async () => {
    const dir = await seed();
    const before = await snapshot(dir);
    failing.counts.clear();
    failing.calls = new Set([`${path.join(dir, 'project.json')}#1`, `${path.join(dir, 'docs', 'draft.md')}#2`]);
    await failure(update(dir, CONFLICTING));
    failing.calls = new Set();
    const merged = await read(dir, 'docs/draft.md');
    // v1's copy of your draft can't be read for now: nothing is put back from it, and nothing is removed.
    reading.fail = new Set([path.join(dir, 'docs', 'versions', 'v1', 'draft.md')]);
    const error = await failure(planChange(dir, CONFLICTING));
    reading.fail = new Set();
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toBe(
      "An earlier update to v2 didn't finish, and some files couldn't be put back yet: docs/draft.md. Run /dev-plumbing again to finish putting them back.",
    );
    expect(await read(dir, 'docs/draft.md')).toBe(merged);
    expect(await read(dir, 'docs/versions/v1/draft.md')).toBe(OURS);
    expect(await fs.readdir(path.join(dir, 'docs', 'versions', 'v1'))).toContain('update.json');
    // Once it can be read, the next look puts it back.
    expect(await planChange(dir, CONFLICTING)).toMatchObject({ from: 1, to: 2 });
    expect(await snapshot(dir)).toEqual(before);
  });

  it('keeps a draft you changed after an update stopped, and sets the copy from before the update aside', async () => {
    const dir = await seed();
    failing.counts.clear();
    // Putting the original and the draft back fails too, so the next look has both to deal with.
    failing.calls = new Set([`${path.join(dir, 'project.json')}#1`, `${path.join(dir, 'docs', 'original.md')}#2`, `${path.join(dir, 'docs', 'draft.md')}#2`]);
    const error = await failure(update(dir, CONFLICTING));
    failing.calls = new Set();
    expect((error as Error).message).toBe(
      "The update didn't finish (No space left on device), and some files couldn't be put back yet: docs/original.md, docs/draft.md. Run /dev-plumbing again to finish putting them back.",
    );
    expect(await read(dir, 'docs/original.md')).toBe(CONFLICTING);
    // Before the next /dev-plumbing, the draft changes: an accepted change, or an edit by hand.
    const edited = `${await read(dir, 'docs/draft.md')}\n## Rollout\n\nShip to one store first.\n`;
    await fs.writeFile(path.join(dir, 'docs', 'draft.md'), edited);
    const aside = 'docs/versions/v1.unfinished-20261005113000';
    expect(await recoverUnfinishedUpdate(dir, new Date('2026-10-05T11:30:00.000Z'))).toEqual({ recovered: true, keptChanged: ['docs/draft.md'], setAside: aside });
    // Your edit wins. The original, which only the update had changed, is v1's again, and the conflict's files are gone.
    expect(await read(dir, 'docs/draft.md')).toBe(edited);
    expect(await read(dir, 'docs/original.md')).toBe(DRAFT);
    expect((await readItems(dir)).values).toEqual([]);
    expect((await readThreads(dir)).values).toEqual([]);
    expect(await readSubmissions(dir)).toEqual([]);
    expect(await readProjectFile(dir)).toMatchObject({ status: 'active', versions: [] });
    // The copy from before the update is set aside with the journal, so v1 is free for the next update's snapshot.
    expect(await fs.readdir(path.join(dir, 'docs', 'versions'))).toEqual(['v1.unfinished-20261005113000']);
    expect((await fs.readdir(path.join(dir, aside))).sort()).toEqual(['draft.md', 'original.md', 'update.json']);
    expect(await read(dir, `${aside}/draft.md`)).toBe(OURS);
    expect(await read(dir, `${aside}/original.md`)).toBe(DRAFT);
    // The next look offers the update again, and it runs, from the draft as you have it.
    expect(await planChange(dir, CONFLICTING)).toMatchObject({ from: 1, to: 2 });
    expect((await update(dir, CONFLICTING)).version).toBe(2);
    expect(await read(dir, 'docs/versions/v1/draft.md')).toBe(edited);
    expect(await read(dir, `${aside}/draft.md`)).toBe(OURS);
  });

  it('keeps a draft you changed after the service stopped part-way through an update', async () => {
    const dir = await seed({ pairs: [pair('q1')] });
    const write = async (rel: string, text: string) => {
      await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
      await fs.writeFile(path.join(dir, rel), text);
    };
    // The update to v2 had written everything but project.json, then you changed the draft it merged.
    const created = ['docs/versions/v2', 'submissions', 'items/plan-changes-v2-1.json', 'threads/t-plan-changes-v2-1.json', 'submissions/s-1.json', 'docs/versions/v2/merged.md'];
    await write('docs/versions/v1/update.json', JSON.stringify({ to: 2, created, wrote: { draft: planHash('The merged draft.\n'), original: planHash(CONFLICTING) } }));
    await snapshotVersion(dir, 1);
    for (const rel of created.slice(2)) await write(rel, '{}');
    await write('docs/original.md', CONFLICTING);
    await write('docs/draft.md', 'The merged draft, and your edit.\n');
    const before = await snapshot(dir);
    expect(await recoverUnfinishedUpdate(dir, T)).toEqual({ recovered: true, keptChanged: ['docs/draft.md'], setAside: 'docs/versions/v1.unfinished-20261005100000' });
    expect(await read(dir, 'docs/draft.md')).toBe('The merged draft, and your edit.\n');
    expect(await read(dir, 'docs/original.md')).toBe(DRAFT);
    expect((await readItems(dir)).values.map((i) => i.id)).toEqual(['q1']);
    expect((await readThreads(dir)).values.map((t) => t.id)).toEqual(['t-q1']);
    expect(await fs.readdir(path.join(dir, 'docs', 'versions'))).toEqual(['v1.unfinished-20261005100000']);
    // What was in v1 is all there, under the new folder.
    const moved = Object.fromEntries(
      Object.entries(before)
        .filter(([p]) => p.startsWith(path.join(dir, 'docs', 'versions', 'v1') + path.sep))
        .map(([p, text]) => [p.replace(`${path.sep}v1${path.sep}`, `${path.sep}v1.unfinished-20261005100000${path.sep}`), text]),
    );
    expect(await snapshot(dir)).toMatchObject(moved);
    expect(Object.keys(moved).map((p) => path.basename(p)).sort()).toEqual(['draft.md', 'items', 'original.md', 'q1.json', 'update.json']);
  });

  it("keeps the merged draft of the version it's at when it sets an unfinished update aside", async () => {
    const dir = await seed();
    await update(dir, CLEAN);
    await writeProjectFile(dir, { ...(await readProjectFile(dir)), status: 'active', importPending: [], reimporting: undefined });
    const mergedV2 = await read(dir, 'docs/versions/v2/merged.md');
    const T3 = new Date('2026-10-06T10:00:00.000Z');
    failing.counts.clear();
    failing.calls = new Set([`${path.join(dir, 'project.json')}#1`, `${path.join(dir, 'docs', 'draft.md')}#2`]);
    await failure(update(dir, CLEAN.replace('a reminders table', 'the reminder log'), { now: T3 }));
    failing.calls = new Set();
    const edited = `${await read(dir, 'docs/draft.md')}\nAnd your edit.\n`;
    await fs.writeFile(path.join(dir, 'docs', 'draft.md'), edited);
    expect(await recoverUnfinishedUpdate(dir, T3)).toMatchObject({ recovered: true, setAside: 'docs/versions/v2.unfinished-20261006100000' });
    expect(await read(dir, 'docs/draft.md')).toBe(edited);
    expect(await fs.readdir(path.join(dir, 'docs', 'versions', 'v2'))).toEqual(['merged.md']);
    expect(await read(dir, 'docs/versions/v2/merged.md')).toBe(mergedV2);
    expect((await fs.readdir(path.join(dir, 'docs', 'versions', 'v2.unfinished-20261006100000'))).sort()).toEqual(['draft.md', 'original.md', 'update.json']);
  });

  it('puts back an update that stopped part-way, the next time it looks at the plan', async () => {
    const dir = await seed({ pairs: [pair('q1')] });
    const before = await snapshot(dir);
    // An update to v2 that stopped once it had written the new original: the service died before project.json.
    const write = async (rel: string, text: string) => {
      await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
      await fs.writeFile(path.join(dir, rel), text);
    };
    const created = ['docs/versions/v2', 'submissions', 'items/plan-changes-v2-1.json', 'threads/t-plan-changes-v2-1.json', 'submissions/s-1.json', 'docs/versions/v2/merged.md'];
    const wrote = { draft: planHash('The merged draft.\n'), original: planHash(CONFLICTING) };
    await write('docs/versions/v1/update.json', JSON.stringify({ to: 2, created, wrote }));
    await snapshotVersion(dir, 1);
    for (const rel of created.slice(2)) await write(rel, '{}');
    await write('docs/draft.md', 'The merged draft.\n');
    await write('docs/original.md', CONFLICTING);
    expect(await planChange(dir, CONFLICTING)).toMatchObject({ from: 1, to: 2 });
    expect(await snapshot(dir)).toEqual(before);
  });

  it('deletes the journal an update left after it finished', async () => {
    const dir = await seed();
    await update(dir, CONFLICTING);
    const after = await snapshot(dir);
    const wrote = { draft: planHash(await read(dir, 'docs/draft.md')), original: planHash(CONFLICTING) };
    await fs.writeFile(path.join(dir, 'docs', 'versions', 'v1', 'update.json'), JSON.stringify({ to: 2, created: ['items/plan-changes-v2-1.json'], wrote }));
    expect(await planChange(dir, CONFLICTING)).toBeNull();
    expect(await snapshot(dir)).toEqual(after);
  });
});
