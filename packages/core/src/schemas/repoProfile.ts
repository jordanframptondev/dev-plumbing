import { z } from 'zod';
import { fullPathSchema } from './fields';

export const repoProfileSchema = z.object({
  name: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/i, 'Use letters, numbers, dots, dashes or underscores'),
  match: z.array(z.string().min(1)).min(1, 'Add at least one git remote'),
  projectsFolder: fullPathSchema.optional(),
  linkIntoClones: z
    .object({ enabled: z.boolean(), linkName: z.string().regex(/^(?!\.{1,2}$)[A-Za-z0-9._-]+$/, 'use a single folder name') })
    .default({ enabled: false, linkName: 'dev-plumbing' }),
  planFolders: z.array(z.string()).default([]),
  schema: z.object({ type: z.enum(['prisma', 'sql', 'other']), path: z.string().min(1) }).optional(),
  conventions: z.array(z.string()).default([]),
  apps: z
    .array(z.object({ name: z.string().min(1), path: z.string().min(1), kitFiles: z.array(z.string()).default([]) }))
    .default([]),
  sensitiveData: z.array(z.string()).default([]),
});

export type RepoProfile = z.infer<typeof repoProfileSchema>;

export const repoProfileDocs: { key: string; description: string }[] = [
  { key: 'name', description: 'Short name for the repo, also the file name.' },
  { key: 'match', description: 'Git remotes that identify this repo, e.g. github.com/acme/acme. Every clone with one of these remotes uses this profile.' },
  { key: 'projectsFolder', description: 'Optional. Store this repo\'s plumbing projects here instead of in settings.projectsFolder.' },
  { key: 'linkIntoClones', description: 'When enabled, a link named linkName pointing at the projects folder is added to every clone, and hidden from git.' },
  { key: 'planFolders', description: 'Where plans usually live in the repo. Used by the file picker.' },
  { key: 'schema', description: 'The database schema file, e.g. { "type": "prisma", "path": "packages/db/prisma/schema.prisma" }.' },
  { key: 'conventions', description: 'Plain-English rules the subagents must follow, e.g. "Ids use uuid()".' },
  { key: 'apps', description: 'Apps in the repo, each with the CSS files that make up its design kit.' },
  { key: 'sensitiveData', description: 'Tags such as PII or payments. They raise the Whiteboard Defense level and security checks.' },
];

/** git@host:owner/repo.git, https://host/owner/repo(.git), ssh://git@host/owner/repo -> host/owner/repo (lowercase). */
export function normalizeRemote(remote: string): string {
  const r = remote.trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const scp = /^[\w.-]+@([^:/]+):(.+)$/.exec(r);
  if (scp) return `${scp[1]}/${scp[2]}`.toLowerCase();
  try {
    const u = new URL(r);
    return `${u.hostname}${u.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return r.toLowerCase();
  }
}
