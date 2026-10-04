import { finalizeRequestSchema, type FinalizeRequest } from '../schemas';
import { projectFiles, readJsonFile } from './io';

// Task 3 adds the rest of the finalize request lifecycle to this file.

/**
 * finalize.json, or null when no finalize is under way. A damaged file reads as none: it only ever holds the one
 * request, so Start finalize can replace it.
 */
export async function readFinalize(dir: string): Promise<FinalizeRequest | null> {
  const r = await readJsonFile(projectFiles(dir).finalize);
  if (!r.ok) return null;
  const parsed = finalizeRequestSchema.safeParse(r.value);
  return parsed.success ? parsed.data : null;
}
