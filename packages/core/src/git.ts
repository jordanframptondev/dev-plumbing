import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { InputError } from './store/io';

const run = promisify(execFile);

export class NotAGitRepoError extends InputError {}
export type GitInfo = { root: string; remote: string | null; branch: string; excludeFile: string };

async function git(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await run('git', args, { cwd });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/** The clone root, its origin remote (or first remote), the current branch, and its info/exclude file. */
export async function gitInfo(cwd: string): Promise<GitInfo> {
  const root = await git(cwd, ['rev-parse', '--show-toplevel']);
  if (!root) throw new NotAGitRepoError(`${cwd} isn't inside a git repository. Run /dev-plumbing from a clone of your repo.`);
  let remote = await git(root, ['remote', 'get-url', 'origin']);
  if (!remote) {
    const first = (await git(root, ['remote']))?.split('\n')[0];
    remote = first ? await git(root, ['remote', 'get-url', first]) : null;
  }
  const branch = (await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])) ?? (await git(root, ['symbolic-ref', '--short', 'HEAD'])) ?? 'HEAD';
  const exclude = (await git(root, ['rev-parse', '--git-path', 'info/exclude'])) ?? '.git/info/exclude';
  return { root, remote, branch, excludeFile: path.resolve(root, exclude) };
}

/** The commit the clone is on (`git rev-parse HEAD`), or null when it can't be read: not a clone, or no commit yet. */
export async function gitHead(cwd: string): Promise<string | null> {
  const sha = await git(cwd, ['rev-parse', 'HEAD']);
  return sha && /^[0-9a-f]{40,64}$/.test(sha) ? sha : null;
}
