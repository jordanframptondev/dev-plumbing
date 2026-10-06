import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { diffText } from './docDiff';
import { headingsOf } from './schemas';

const run = promisify(execFile);

// git merge-file's markers. They're 31 characters long, so a plan's own line of seven < or = is never taken for one.
const START = `${'<'.repeat(31)} draft`;
const BASE = `${'|'.repeat(31)} original`;
const MIDDLE = '='.repeat(31);
const END = `${'>'.repeat(31)} repo`;

/**
 * One passage both sides changed: the draft's text (`ours`), the old plan's (`base`) and the repo's (`theirs`).
 * `movedTo` is set when the repo took the passage out here but has it, unchanged, elsewhere in the plan: the heading
 * it's under there. The draft then has both copies.
 */
export type MergeConflict = { heading: string | null; ours: string; base: string; theirs: string; movedTo?: string };
export type MergeResult = { text: string; clean: number; conflicts: MergeConflict[] };

/** The merge couldn't run: git is missing, it took too long, or it failed. */
export class MergeError extends Error {}

type ExecFailure = Error & { code?: number | string | null; killed?: boolean; stdout?: string; stderr?: string };

const lf = (text: string) => text.replace(/\r\n/g, '\n');
/** Every side ends with a newline, so a last line merges and diffs like any other. mergePlan sets the text's ending afterwards. */
const withNewline = (text: string) => (text && !text.endsWith('\n') ? `${text}\n` : text);

function mergeError(e: ExecFailure): MergeError {
  if (e.code === 'ENOENT') return new MergeError("The merge needs git, and git wasn't found on this Mac.");
  if (e.killed) return new MergeError('git merge-file took more than 20 seconds, so the merge was stopped.');
  const why = e.stderr?.trim().split('\n')[0] || (typeof e.code === 'number' ? `exit code ${e.code}` : e.message);
  return new MergeError(`git merge-file failed: ${why}`);
}

/** git merge-file's output, on three temp files that are always removed. Exit codes 1–127 count conflicts. */
async function mergeFile(ours: string, base: string, theirs: string): Promise<{ stdout: string; code: number }> {
  // Absolute, so a relative TMPDIR still finds the files from git's cwd.
  const dir = await fs.mkdtemp(path.join(path.resolve(os.tmpdir()), 'dp-merge-'));
  try {
    const files = [path.join(dir, 'draft.md'), path.join(dir, 'original.md'), path.join(dir, 'repo.md')];
    await Promise.all([fs.writeFile(files[0], ours), fs.writeFile(files[1], base), fs.writeFile(files[2], theirs)]);
    const args = ['merge-file', '-p', '--diff3', '--marker-size=31', '-L', 'draft', '-L', 'original', '-L', 'repo', ...files];
    try {
      return { stdout: (await run('git', args, { cwd: dir, timeout: 20_000, maxBuffer: 16 * 1024 * 1024 })).stdout, code: 0 };
    } catch (error) {
      const e = error as ExecFailure;
      if (typeof e.code === 'number' && e.code >= 1 && e.code <= 127 && typeof e.stdout === 'string') return { stdout: e.stdout, code: e.code };
      throw mergeError(e);
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

type Found = { start: number; ours: string[]; base: string[]; theirs: string[] };

/** The merge with every conflict resolved to the draft's side, and each conflict with where it starts in that text. */
function resolveToOurs(output: string): { text: string; found: Found[] } {
  const lines: string[] = [];
  const found: Found[] = [];
  let side: 'ours' | 'base' | 'theirs' | null = null;
  let current: Found = { start: 0, ours: [], base: [], theirs: [] };
  for (const line of output.split('\n')) {
    if (side === null && line === START) {
      current = { start: lines.length, ours: [], base: [], theirs: [] };
      side = 'ours';
    } else if (side === 'ours' && line === BASE) side = 'base';
    else if (side === 'base' && line === MIDDLE) side = 'theirs';
    else if (side === 'theirs' && line === END) {
      found.push(current);
      side = null;
    } else if (side === null) lines.push(line);
    else {
      current[side].push(line);
      if (side === 'ours') lines.push(line);
    }
  }
  if (side !== null) throw new MergeError("git merge-file's output ended inside a conflict.");
  return { text: lines.join('\n'), found };
}

/** How many change blocks there are from `before` to `after`: runs of added or removed lines between unchanged ones. */
function changeBlocks(before: string, after: string): number {
  let blocks = 0;
  let inBlock = false;
  for (const segment of diffText(before, after)) {
    if (segment.kind === 'same') inBlock = false;
    else if (!inBlock) {
      blocks++;
      inBlock = true;
    }
  }
  return blocks;
}

/**
 * Three-way merge with `git merge-file -p --diff3 --marker-size=31 -L draft -L original -L repo`.
 * `text` is the merge with every conflict resolved to `ours`, so no markers are left.
 * `clean` counts the change blocks the merge made in the draft: what you read as "merged into your draft".
 * `heading` is the conflict's own heading when the draft's side starts with one, else the nearest heading above it in
 * `text`, without its #s.
 */
export async function mergePlan(o: { base: string; ours: string; theirs: string }): Promise<MergeResult> {
  const base = withNewline(lf(o.base));
  const ours = withNewline(lf(o.ours));
  const theirs = lf(o.theirs);
  const output = await mergeFile(ours, base, withNewline(theirs));
  const merged = resolveToOurs(output.stdout);
  // git's exit code counts the conflicts (capped at 127), so output that disagrees isn't a merge and must not replace the draft.
  const agrees = output.code === 127 ? merged.found.length >= 127 : merged.found.length === output.code;
  if (!agrees) throw new MergeError(`git merge-file reported ${output.code} conflicts, but its output had ${merged.found.length}.`);
  // The text ends with a newline when the repo's plan does.
  const text = theirs.endsWith('\n') || !merged.text.endsWith('\n') ? merged.text : merged.text.slice(0, -1);
  const headings = headingsOf(text);
  const lines = text.split('\n');
  /** Where line n starts in `text`. */
  const offsetOf = (n: number) => lines.slice(0, n).reduce((sum, line) => sum + line.length + 1, 0);
  /** The heading at line n when it's one, else the nearest one above it. */
  const headingAt = (n: number, inclusive: boolean) => [...headings].reverse().find((h) => (inclusive ? h.line <= n : h.line < n))?.text ?? null;
  const conflicts = merged.found.map((c): MergeConflict => {
    // A conflict whose draft side starts with a heading (after any blank lines) is under that heading.
    const first = c.ours.findIndex((line) => line.trim() !== '');
    const own = first >= 0 ? headings.find((h) => h.line === c.start + first) : undefined;
    const conflict: MergeConflict = { heading: own?.text ?? headingAt(c.start, false), ours: c.ours.join('\n'), base: c.base.join('\n'), theirs: c.theirs.join('\n') };
    // The repo took the passage out here. If it has the same text elsewhere, it moved it, and the draft has both copies.
    const moved = conflict.base.trim();
    if (!conflict.theirs.trim() && moved) {
      const from = offsetOf(c.start);
      const to = from + conflict.ours.length;
      let at = text.indexOf(moved);
      while (at >= 0 && at < to && at + moved.length > from) at = text.indexOf(moved, at + 1);
      const where = at >= 0 ? headingAt(text.slice(0, at).split('\n').length - 1, true) : null;
      if (where) conflict.movedTo = where;
    }
    return conflict;
  });
  return { text, clean: changeBlocks(ours, merged.text), conflicts };
}
