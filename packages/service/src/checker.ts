import fs from 'node:fs/promises';
import { createDataChecker, expandHome, readProjectFile, type DataChecker, type LoadedConfig, type ProjectRef } from '@dev-plumbing/core';
import type { AppContext } from './context';

/** The plan's clone, or null when it isn't a folder on this Mac any more (or project.json can't be read). */
export async function cloneOf(ctx: AppContext, ref: ProjectRef): Promise<string | null> {
  const project = await readProjectFile(ref.dir).catch(() => null);
  if (!project) return null;
  const clone = expandHome(project.source.clone, ctx.home);
  const stat = await fs.stat(clone).catch(() => null);
  return stat?.isDirectory() ? clone : null;
}

/** Checks against the code, for one request: built from the plan's clone and the repo's profile, and never stored. */
export async function checkerFor(ctx: AppContext, cfg: LoadedConfig, ref: ProjectRef): Promise<DataChecker> {
  return createDataChecker({ clone: await cloneOf(ctx, ref), profile: cfg.repos.find((p) => p.name === ref.repo) });
}
