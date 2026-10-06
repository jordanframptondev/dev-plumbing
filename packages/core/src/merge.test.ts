import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MergeError, mergePlan } from './merge';
import { removeTempDirs, tempDir } from '../../../testkit/tmp';

afterAll(removeTempDirs);

const PLAN = [
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
  '## Channels',
  '',
  'Send by email.',
  '',
].join('\n');

/** `text` with `from` replaced by `to`, once. Throws when `from` isn't there, so a test can't edit nothing by mistake. */
function edit(text: string, ...pairs: [string, string][]): string {
  return pairs.reduce((t, [from, to]) => {
    if (!t.includes(from)) throw new Error(`"${from}" isn't in the text.`);
    return t.replace(from, to);
  }, text);
}

const APPROACH = 'A daily job finds subscriptions due soon and sends a reminder.';
/** Any line git could have left: seven or more of <, |, = or > at its start. */
const MARKER = /^(<{7}|\|{7}|={7}|>{7})/m;

describe('merging the repo plan into the draft', () => {
  it('takes both sides when they changed different sections', async () => {
    const ours = edit(PLAN, ['due soon', 'due in the next 3 days']);
    const theirs = edit(PLAN, ['Log reminders in a table.', 'Log each reminder in a RestockReminder table.'], ['Send by email.', 'Send by email and SMS.']);
    expect(await mergePlan({ base: PLAN, ours, theirs })).toEqual({
      text: edit(PLAN, ['due soon', 'due in the next 3 days'], ['Log reminders in a table.', 'Log each reminder in a RestockReminder table.'], ['Send by email.', 'Send by email and SMS.']),
      clean: 2,
      conflicts: [],
    });
  });

  it("takes the repo's changes when the draft didn't change", async () => {
    const theirs = edit(PLAN, ['Send by email.', 'Send by email and SMS.']);
    expect(await mergePlan({ base: PLAN, ours: PLAN, theirs })).toEqual({ text: theirs, clean: 1, conflicts: [] });
  });

  it("keeps the draft when the repo didn't change", async () => {
    const ours = edit(PLAN, ['Send by email.', 'Send by email and SMS.']);
    expect(await mergePlan({ base: PLAN, ours, theirs: PLAN })).toEqual({ text: ours, clean: 0, conflicts: [] });
  });

  it('changes nothing when nothing changed', async () => {
    expect(await mergePlan({ base: PLAN, ours: PLAN, theirs: PLAN })).toEqual({ text: PLAN, clean: 0, conflicts: [] });
  });

  it('keeps the draft where both changed the same passage, and says what each side had', async () => {
    const ours = edit(PLAN, ['due soon and sends a reminder.', 'due in 3 days and texts a reminder.']);
    const theirs = edit(PLAN, ['due soon and sends a reminder.', 'due soon and emails a reminder.'], ['Send by email.', 'Send by email and push.']);
    expect(await mergePlan({ base: PLAN, ours, theirs })).toEqual({
      text: edit(ours, ['Send by email.', 'Send by email and push.']),
      clean: 1,
      conflicts: [
        {
          heading: 'Approach',
          ours: 'A daily job finds subscriptions due in 3 days and texts a reminder.',
          base: APPROACH,
          theirs: 'A daily job finds subscriptions due soon and emails a reminder.',
        },
      ],
    });
  });

  it('lists two conflicts in the order they come', async () => {
    const ours = edit(PLAN, ['sends a reminder.', 'texts a reminder.'], ['in a table.', 'in a reminders table.']);
    const theirs = edit(PLAN, ['sends a reminder.', 'emails a reminder.'], ['in a table.', 'in the audit log.']);
    const r = await mergePlan({ base: PLAN, ours, theirs });
    expect(r.text).toBe(ours);
    expect(r.clean).toBe(0);
    expect(r.conflicts).toEqual([
      { heading: 'Approach', ours: 'A daily job finds subscriptions due soon and texts a reminder.', base: APPROACH, theirs: 'A daily job finds subscriptions due soon and emails a reminder.' },
      { heading: 'Data', ours: 'Log reminders in a reminders table.', base: 'Log reminders in a table.', theirs: 'Log reminders in the audit log.' },
    ]);
  });

  it('keeps a passage the draft deleted deleted, when the repo changed it', async () => {
    const ours = edit(PLAN, ['Log reminders in a table.\n\n', '']);
    const theirs = edit(PLAN, ['Log reminders in a table.', 'Log reminders in a table, with the send time.']);
    expect(await mergePlan({ base: PLAN, ours, theirs })).toEqual({
      text: ours,
      clean: 0,
      conflicts: [{ heading: 'Data', ours: '', base: 'Log reminders in a table.\n', theirs: 'Log reminders in a table, with the send time.\n' }],
    });
  });

  it("puts a conflict on a heading under the draft's heading", async () => {
    const ours = edit(PLAN, ['## Data\n\nLog reminders in a table.', '## Storage\n\nKeep reminders in a table.']);
    const theirs = edit(PLAN, ['## Data', '## Data model']);
    expect(await mergePlan({ base: PLAN, ours, theirs })).toEqual({
      text: ours,
      clean: 0,
      conflicts: [{ heading: 'Storage', ours: '## Storage', base: '## Data', theirs: '## Data model' }],
    });
  });

  it('says where the repo moved a passage the draft edited, since the draft then has both copies', async () => {
    const CHANNELS = '## Channels\n\nSend by email.\n\n';
    const ours = edit(PLAN, ['Send by email.', 'Send by email, and by SMS for opted-in customers.']);
    // The repo moves Channels up, unchanged, and the plan now ends with Data.
    const theirs = edit(PLAN, ['## Approach', `${CHANNELS}## Approach`], ['Log reminders in a table.\n\n## Channels\n\nSend by email.\n', 'Log reminders in a table.\n']);
    const r = await mergePlan({ base: PLAN, ours, theirs });
    expect(r.text).toBe(edit(ours, ['## Approach', `${CHANNELS}## Approach`]));
    expect(r.text.match(/^## Channels$/gm)).toHaveLength(2);
    expect(r.conflicts).toEqual([
      {
        heading: 'Channels',
        ours: '\n## Channels\n\nSend by email, and by SMS for opted-in customers.',
        base: '\n## Channels\n\nSend by email.',
        theirs: '',
        movedTo: 'Channels',
      },
    ]);
  });

  it('merges Windows line endings as plain newlines', async () => {
    const crlf = (s: string) => s.replace(/\n/g, '\r\n');
    const ours = edit(PLAN, ['due soon and sends a reminder.', 'due in 3 days and texts a reminder.']);
    const theirs = edit(PLAN, ['due soon and sends a reminder.', 'due soon and emails a reminder.']);
    const r = await mergePlan({ base: crlf(PLAN), ours: crlf(ours), theirs: crlf(theirs) });
    expect(r.text).toBe(ours);
    expect(r.conflicts).toEqual([
      { heading: 'Approach', ours: 'A daily job finds subscriptions due in 3 days and texts a reminder.', base: APPROACH, theirs: 'A daily job finds subscriptions due soon and emails a reminder.' },
    ]);
  });

  it("ends the text with a newline only when the repo's plan does", async () => {
    expect(await mergePlan({ base: 'a\nb', ours: 'a\nb mine', theirs: 'a\nb theirs' })).toEqual({
      text: 'a\nb mine',
      clean: 0,
      conflicts: [{ heading: null, ours: 'b mine', base: 'b', theirs: 'b theirs' }],
    });
    expect((await mergePlan({ base: 'a\nb', ours: 'a mine\nb', theirs: 'a\nb\n' })).text).toBe('a mine\nb\n');
    expect((await mergePlan({ base: 'a\nb\n', ours: 'a mine\nb\n', theirs: 'a\nb' })).text).toBe('a mine\nb');
  });

  it("reads a plan's own seven-character conflict lines as text", async () => {
    const fenced = ['# Merging', '', '## Example', '', '```', '<<<<<<< HEAD', 'mine', '=======', 'theirs', '>>>>>>> main', '```', ''].join('\n');
    // Both sides change the lines around the plan's own =======, so it sits inside the conflict, on every side.
    const ours = edit(fenced, ['mine\n=======\ntheirs\n', 'my change\n=======\ntheirs too\n']);
    const theirs = edit(fenced, ['mine\n=======\ntheirs\n', 'mine\n-------\ntheirs\n']);
    expect(await mergePlan({ base: fenced, ours, theirs })).toEqual({
      text: ours,
      clean: 0,
      conflicts: [{ heading: 'Example', ours: 'my change\n=======\ntheirs too', base: 'mine\n=======\ntheirs', theirs: 'mine\n-------\ntheirs' }],
    });
  });

  it('removes its temp folder after a merge, and after git fails', async () => {
    const tmp = tempDir('dp-merge-tmp-');
    const fake = tempDir('dp-fake-git-');
    await fs.writeFile(path.join(fake, 'git'), '#!/bin/sh\necho "fatal: not today" >&2\nexit 255\n', { mode: 0o755 });
    const env = { TMPDIR: process.env.TMPDIR, PATH: process.env.PATH };
    process.env.TMPDIR = tmp;
    try {
      const ours = edit(PLAN, ['sends a reminder.', 'texts a reminder.']);
      const theirs = edit(PLAN, ['sends a reminder.', 'emails a reminder.']);
      expect((await mergePlan({ base: PLAN, ours, theirs })).conflicts).toHaveLength(1);
      expect(await fs.readdir(tmp)).toEqual([]);
      // A relative TMPDIR works too.
      process.env.TMPDIR = path.relative(process.cwd(), tmp);
      expect((await mergePlan({ base: PLAN, ours, theirs })).conflicts).toHaveLength(1);
      expect(await fs.readdir(tmp)).toEqual([]);
      process.env.TMPDIR = tmp;
      // A git that fails with an exit code outside 1–127.
      process.env.PATH = fake;
      const failed = await mergePlan({ base: PLAN, ours, theirs }).catch((e: unknown) => e);
      expect(failed).toBeInstanceOf(MergeError);
      expect((failed as Error).message).toBe('git merge-file failed: fatal: not today');
      expect(await fs.readdir(tmp)).toEqual([]);
      // No git at all.
      process.env.PATH = tmp;
      await expect(mergePlan({ base: PLAN, ours, theirs })).rejects.toThrow("The merge needs git, and git wasn't found on this Mac.");
      expect(await fs.readdir(tmp)).toEqual([]);
    } finally {
      process.env.TMPDIR = env.TMPDIR;
      process.env.PATH = env.PATH;
    }
  });
});

/** A small seeded random number generator (mulberry32), so every run fuzzes the same 50 edits. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

describe('the merge, fuzzed', () => {
  // 50 runs of git take about a second; the timeout leaves room for a busy machine.
  it('conflict markers never reach the draft', async () => {
    const next = random(5);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(next() * xs.length)];
    const WORDS = ['reminder', 'job', 'daily', 'email', 'SMS', 'table', 'customer', 'runs', 'out', 'soon', 'sends', 'logs'] as const;
    const sentence = () => `${Array.from({ length: 3 + Math.floor(next() * 5) }, () => pick(WORDS)).join(' ')}.`;
    /** Up to three edits near the middle of the plan, where both sides' edits often meet. */
    const editLines = (lines: string[]) => {
      const out = [...lines];
      for (let n = 1 + Math.floor(next() * 3); n > 0; n--) {
        const at = 4 + Math.floor(next() * 8);
        const op = next();
        if (op < 0.4) out[at] = sentence();
        else if (op < 0.7) out.splice(at, 1);
        else out.splice(at, 0, next() < 0.3 ? `## ${pick(WORDS)}` : sentence());
      }
      return out;
    };
    let conflicts = 0;
    for (let run = 0; run < 50; run++) {
      const base = ['# Plan', '', ...Array.from({ length: 16 }, (_, i) => (i % 4 === 0 ? `## Part ${i / 4 + 1}` : sentence()))];
      const ours = editLines(base);
      const theirs = editLines(base);
      const r = await mergePlan({ base: `${base.join('\n')}\n`, ours: `${ours.join('\n')}\n`, theirs: `${theirs.join('\n')}\n` });
      expect(r.text, `run ${run}`).not.toMatch(MARKER);
      expect(r.text.endsWith('\n'), `run ${run}`).toBe(true);
      // The draft keeps its own text at every conflict.
      for (const c of r.conflicts) expect(r.text, `run ${run}`).toContain(c.ours);
      conflicts += r.conflicts.length;
    }
    expect(conflicts).toBeGreaterThan(10);
  }, 30_000);
});
