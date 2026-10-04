import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { writeJsonAtomic } from '../atomic';
import type { RepoProfile } from '../schemas';

/** Detect again requests, and when each repo's profile was last detected, by repo name. */
export const detectFilePath = (configDir: string) => path.join(configDir, 'run', 'detect.json');

const entrySchema = z.object({ requestedAt: z.string().optional(), lastDetectedAt: z.string().optional() });
type Entry = z.infer<typeof entrySchema>;
type DetectFile = Record<string, Entry>;

/** The file as it is. A missing or damaged file reads as no requests, so it can never stop a project opening. */
async function readDetectFile(configDir: string): Promise<DetectFile> {
  try {
    const parsed = z.record(entrySchema).safeParse(JSON.parse(await fs.readFile(detectFilePath(configDir), 'utf8')));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/** One repo's entry. Only the file's own keys count, so a repo named like an Object method reads as nothing. */
const entryOf = (file: DetectFile, repo: string): Entry => (Object.hasOwn(file, repo) ? file[repo]! : {});

/** Settings → Repos → Detect again: the next Claude window for this repo runs the repo-setup subagent again. */
export async function requestDetect(configDir: string, repo: string, now: Date = new Date()): Promise<void> {
  const file = await readDetectFile(configDir);
  await writeJsonAtomic(detectFilePath(configDir), { ...file, [repo]: { ...entryOf(file, repo), requestedAt: now.toISOString() } });
}

export async function pendingDetect(configDir: string, repo: string): Promise<boolean> {
  return Boolean(entryOf(await readDetectFile(configDir), repo).requestedAt);
}

/** A detected profile was saved for this repo. Any request is done, and the time is kept for Settings. */
export async function finishDetect(configDir: string, repo: string, now: Date = new Date()): Promise<void> {
  const file = await readDetectFile(configDir);
  await writeJsonAtomic(detectFilePath(configDir), { ...file, [repo]: { lastDetectedAt: now.toISOString() } });
}

/** Repo name → when its profile was last detected. */
export async function lastDetected(configDir: string): Promise<Record<string, string>> {
  const file = await readDetectFile(configDir);
  return Object.fromEntries(Object.entries(file).flatMap(([repo, e]) => (e.lastDetectedAt ? [[repo, e.lastDetectedAt]] : [])));
}

/**
 * Detect again's result. The detected profile replaces only planFolders, schema, conventions, apps and sensitiveData.
 * The name, the remotes it matches, and the user's own projectsFolder and linkIntoClones never change.
 */
export function mergeDetected(existing: RepoProfile, detected: RepoProfile): RepoProfile {
  const merged: RepoProfile = {
    ...existing,
    planFolders: detected.planFolders,
    conventions: detected.conventions,
    apps: detected.apps,
    sensitiveData: detected.sensitiveData,
  };
  if (detected.schema) merged.schema = detected.schema;
  else delete merged.schema;
  return merged;
}
