import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Write to a temp file in the same folder, then rename, so readers never see half a file. */
export async function writeFileAtomic(file: string, data: string | Uint8Array, mode?: number): Promise<void> {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await fs.writeFile(tmp, data, mode === undefined ? undefined : { mode });
    await fs.rename(tmp, file);
  } catch (error) {
    // Don't leave the half-written temp file behind. The original error is the one that matters.
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  return writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}
