import fs from 'node:fs/promises';
import { expandHome, InputError, type FinalizeView, type PlumbingProject } from '@dev-plumbing/core';

/** The clones this project was opened from that are still folders on this Mac: the source clone first, each once. */
export async function clonesOf(project: PlumbingProject, home?: string): Promise<FinalizeView['clones']> {
  const source = expandHome(project.source.clone, home);
  const found: FinalizeView['clones'] = [];
  for (const clone of new Set([source, ...project.clones.map((c) => expandHome(c, home))])) {
    const stat = await fs.stat(clone).catch(() => null);
    if (stat?.isDirectory()) found.push({ path: clone, source: clone === source });
  }
  return found;
}

/**
 * The clone the browser picked, with ~ expanded, once it's known to be one this project was opened from. Accept and
 * Export then check its remote and every path inside it.
 */
export async function knownClone(project: PlumbingProject, clone: string, home?: string): Promise<string> {
  const path = expandHome(clone, home);
  if (!(await clonesOf(project, home)).some((x) => x.path === path)) throw new InputError("That folder isn't one of the clones this project was opened from.");
  return path;
}
