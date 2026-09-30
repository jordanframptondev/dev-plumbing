import fs from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from './atomic';

export type RunInfo = { pid: number; port: number; token: string; startedAt: string; version: string };

export const runFilePath = (configDir: string) => path.join(configDir, 'run', 'service.json');

export async function writeRunFile(configDir: string, info: RunInfo): Promise<void> {
  await writeFileAtomic(runFilePath(configDir), `${JSON.stringify(info, null, 2)}\n`, 0o600);
}

export async function readRunFile(configDir: string): Promise<RunInfo | null> {
  try {
    const v = JSON.parse(await fs.readFile(runFilePath(configDir), 'utf8'));
    return typeof v?.pid === 'number' && typeof v?.port === 'number' && typeof v?.token === 'string' ? (v as RunInfo) : null;
  } catch {
    return null;
  }
}

/** Removes the run file. With a pid, only if the file belongs to that pid. */
export async function removeRunFile(configDir: string, pid?: number): Promise<void> {
  if (pid !== undefined) {
    const current = await readRunFile(configDir);
    if (current && current.pid !== pid) return;
  }
  await fs.rm(runFilePath(configDir), { force: true });
}
