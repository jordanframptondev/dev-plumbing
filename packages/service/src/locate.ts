import { findProjects, loadConfig, StoreError, type LoadedConfig, type ProjectRef } from '@dev-plumbing/core';
import type { AppContext } from './context';

export async function locateProject(ctx: AppContext, repo: string, id: string): Promise<{ cfg: LoadedConfig; ref: ProjectRef }> {
  const cfg = await loadConfig(ctx.configDir);
  const ref = (await findProjects(cfg.settings, cfg.repos, ctx.home)).find((r) => r.repo === repo && r.id === id);
  if (!ref) throw new StoreError("That plumbing project doesn't exist.");
  return { cfg, ref };
}
