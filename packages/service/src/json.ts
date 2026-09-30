import type { Context } from 'hono';

export const EXPECTED_OBJECT = { error: 'Expected a JSON object.' } as const;

const isPlainObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Reads the request body as a JSON object. Returns null for anything else: a body that isn't JSON,
 * or JSON that is null, an array, a string or a number. Callers answer null with 400 EXPECTED_OBJECT.
 */
export async function readJsonObject(c: Context): Promise<Record<string, unknown> | null> {
  let value: unknown;
  try {
    value = JSON.parse(await c.req.text());
  } catch {
    return null;
  }
  return isPlainObject(value) ? value : null;
}
