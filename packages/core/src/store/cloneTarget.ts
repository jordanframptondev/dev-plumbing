import fs from 'node:fs/promises';
import path from 'node:path';
import { gitInfo } from '../git';
import { expandHome } from '../paths';
import { normalizeRemote, type RepoProfile } from '../schemas';
import { finalName } from './finalize';
import { InputError } from './io';
import { matchProfile } from './open';

// The checks made before anything is written into a clone, shared by Accept (the final) and Export .md (the Whiteboard
// Defense): the clone is a clone of this repo, picked by its root; the file goes in the plan's own folder, really inside
// it; and nothing is written through a link. `verb` names the action in the messages that say what to do next.

export type CloneVerb = 'Accept' | 'Export';

/** What's at p, without following a link, or null when nothing is. */
const lstat = (p: string) => fs.lstat(p).catch(() => null);

/** A file's contents, or null when there is no such file. Any other failure to read it stops the action before it writes. */
export async function readOrNull(file: string, label: string, verb: CloneVerb = 'Accept'): Promise<Buffer | null> {
  try {
    return await fs.readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new InputError(`${label} couldn't be read (${error instanceof Error ? error.message : String(error)}). Fix that, then ${verb.toLowerCase()} again.`);
  }
}

/** p is root, or inside it. */
export function within(root: string, p: string): boolean {
  const rel = path.relative(root, p);
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

/** The clone's real path, once it's known to be the top of a git clone whose remote is one of the profile's. */
export async function checkClone(clone: string, profile: RepoProfile, home: string | undefined): Promise<string> {
  if (!(clone === '~' || clone.startsWith('~/') || path.isAbsolute(clone))) throw new InputError('Pick a clone by its full path.');
  const root = await fs.realpath(expandHome(clone, home)).catch(() => null);
  const stat = root ? await fs.stat(root).catch(() => null) : null;
  if (!root || !stat?.isDirectory()) throw new InputError(`${clone} isn't a folder on this Mac.`);
  const git = await gitInfo(root).catch(() => null);
  if (!git) throw new InputError(`${clone} isn't a git clone. Copy into a clone of ${profile.name}.`);
  if ((await fs.realpath(git.root).catch(() => git.root)) !== root) throw new InputError(`${clone} is a folder inside a clone. Pick the clone itself.`);
  if (!matchProfile(git.remote, [profile])) {
    const wanted = profile.match.map(normalizeRemote).join(' or ');
    throw new InputError(
      git.remote ? `${clone} is a clone of ${normalizeRemote(git.remote)}, not ${wanted}.` : `${clone} has no git remote, so it can't be checked against ${wanted}.`,
    );
  }
  return root;
}

/**
 * The plan's own folder in the clone, where both <name>.final.md and <name>.whiteboard-defense.md go. It must really be
 * inside the clone, with no link anywhere on the way, so a link can't send a file somewhere else. `name` is the plan
 * file's name without its extension, and `planRel` the folder relative to the clone ('.' at the top).
 */
export async function planFolder(clone: string, root: string, sourcePath: string, verb: CloneVerb): Promise<{ name: string; planRel: string; planDir: string }> {
  const name = finalName(sourcePath);
  const planRel = path.posix.dirname(sourcePath);
  const planDir = path.resolve(root, planRel);
  if (!name || !within(root, planDir)) throw new InputError(`The plan's path, ${sourcePath}, doesn't give a place inside the clone for the copy.`);
  const real = await fs.realpath(planDir).catch(() => null);
  if (!real) throw new InputError(`${clone} has no ${planRel} folder, where the plan lives.`);
  if (real !== planDir) throw new InputError(`${planRel} in ${clone} is or goes through a link. ${verb} writes only into real folders inside the clone.`);
  if (!(await fs.stat(planDir)).isDirectory()) throw new InputError(`${planRel} in ${clone} isn't a folder.`);
  return { name, planRel, planDir };
}

/** A target may be missing, or be a real file (or folder). A link is never written through, wherever it points. */
export async function checkTarget(clone: string, file: string, rel: string, kind: 'file' | 'folder', verb: CloneVerb): Promise<void> {
  const stat = await lstat(file);
  if (!stat) return;
  if (stat.isSymbolicLink()) throw new InputError(`${rel} in ${clone} is a link. ${verb} won't write through it: remove the link, then ${verb.toLowerCase()} again.`);
  if (kind === 'file' ? !stat.isFile() : !stat.isDirectory()) throw new InputError(`${rel} in ${clone} isn't a ${kind}.`);
}
