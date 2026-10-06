import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from '../atomic';
import type { PlanVersion, PlumbingProject } from '../schemas';
import { ConflictError, docPath, readProjectFile } from './io';

// The plan's version trail. docs/original.md and docs/draft.md always hold the current version; before an update
// brings the next one in, they're copied to docs/versions/v<n>/, so every earlier version's plan and draft stay readable.

/** sha256 hex of a plan's text. source.hashAtImport and each version's hash use it. */
export function planHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** The project's versions, oldest first. A project that was never updated is at v1, read from `source`. */
export function projectVersions(project: PlumbingProject): PlanVersion[] {
  if (project.versions.length) return [...project.versions].sort((a, b) => a.n - b.n);
  const { source } = project;
  return [{ n: 1, at: project.createdAt, hash: source.hashAtImport, clone: source.clone, branch: source.branch, commit: null }];
}

/** The version the working files hold: the newest one. */
export function currentVersion(project: PlumbingProject): PlanVersion {
  return projectVersions(project).at(-1)!;
}

/**
 * A version's documents: its plan (`original`) and draft, and `merged`, the draft as the update that brought it in
 * left it, before anyone changed it.
 */
export type VersionDoc = 'original' | 'draft' | 'merged';

/** docs/versions/v<n>/<which>.md, relative to the project folder. */
export function versionDocRel(n: number, which: VersionDoc): string {
  return `docs/versions/v${n}/${which}.md`;
}

/**
 * Copies the working plan and draft to docs/versions/v<n>/, byte for byte, and the items to docs/versions/v<n>/items/,
 * so what the threads had settled is kept too. Returns every path it wrote, original and draft first. Refuses when the
 * folder already has an original.md or a draft.md, so a snapshot is never overwritten; the update's merged.md and its
 * journal may be there. If a copy fails, what it wrote is removed again.
 */
export async function snapshotVersion(dir: string, n: number): Promise<string[]> {
  const folder = docPath(dir, `docs/versions/v${n}`);
  const present = await fs.readdir(folder).catch((): string[] => []);
  if (present.includes('original.md') || present.includes('draft.md')) throw new ConflictError(`Version ${n} is already saved in docs/versions/v${n}.`);
  const project = await readProjectFile(dir);
  const items = (await fs.readdir(docPath(dir, 'items')).catch((): string[] => [])).filter((f) => f.endsWith('.json')).sort();
  const copies: [string, string][] = [
    [project.docs.original, versionDocRel(n, 'original')],
    [project.docs.draft, versionDocRel(n, 'draft')],
    ...items.map((f): [string, string] => [`items/${f}`, `docs/versions/v${n}/items/${f}`]),
  ];
  const written: string[] = [];
  try {
    for (const [from, to] of copies) {
      await writeFileAtomic(docPath(dir, to), await fs.readFile(docPath(dir, from)));
      written.push(to);
    }
  } catch (error) {
    for (const rel of written) await fs.rm(docPath(dir, rel), { force: true }).catch(() => undefined);
    // The folders it made go too. rmdir only removes an empty folder, so other versions' snapshots stay.
    for (const made of [path.join(folder, 'items'), folder, path.dirname(folder)]) await fs.rmdir(made).catch(() => undefined);
    throw error;
  }
  return written;
}

/**
 * A version's plan (`original`) or draft: the working files for the current version, its snapshot for an older one.
 * `merged` is always read from the version's own folder: v1 has none. Null for a version the project doesn't have, or
 * a file that can't be read.
 */
export async function readVersionDoc(dir: string, project: PlumbingProject, n: number, which: VersionDoc): Promise<string | null> {
  if (!projectVersions(project).some((v) => v.n === n)) return null;
  const rel = which !== 'merged' && n === currentVersion(project).n ? project.docs[which] : versionDocRel(n, which);
  return fs.readFile(docPath(dir, rel), 'utf8').catch(() => null);
}
