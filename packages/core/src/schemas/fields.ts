import { z } from 'zod';

type Base = { key: string; label: string; description: string };

export type FieldSpec =
  | (Base & { kind: 'string'; default: string; format?: 'path' })
  | (Base & { kind: 'number'; default: number; min: number; max: number })
  | (Base & { kind: 'boolean'; default: boolean })
  | (Base & { kind: 'enum'; default: string; options: readonly string[] });

export type FieldError = { key: string; message: string; unknown?: boolean };

function schemaFor(field: FieldSpec): z.ZodTypeAny {
  switch (field.kind) {
    case 'string':
      return z.string().trim().min(1);
    case 'number':
      return z.number().int().min(field.min).max(field.max);
    case 'boolean':
      return z.boolean();
    case 'enum':
      return z.enum(field.options as [string, ...string[]]);
  }
}

/** { models: { thread: 'x' } } -> { 'models.thread': 'x' }. Non-objects give {}. */
export function flatten(obj: unknown, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

export function unflatten(flat: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.');
    let node = out;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) node[part] = value;
      else node = (node[part] ??= {}) as Record<string, unknown>;
    });
  }
  return out;
}

export function defaultsOf(fields: readonly FieldSpec[]): Record<string, unknown> {
  return unflatten(Object.fromEntries(fields.map((f) => [f.key, f.default])));
}

/**
 * Checks each field on its own. A missing field quietly takes its default.
 * A bad field takes its default and is reported. Unknown keys are reported and dropped.
 */
export function parseFields(
  fields: readonly FieldSpec[],
  input: unknown,
): { value: Record<string, unknown>; errors: FieldError[] } {
  const flat = flatten(input);
  const errors: FieldError[] = [];
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (!(field.key in flat)) {
      result[field.key] = field.default;
      continue;
    }
    const parsed = schemaFor(field).safeParse(flat[field.key]);
    if (parsed.success) result[field.key] = parsed.data;
    else {
      result[field.key] = field.default;
      errors.push({ key: field.key, message: parsed.error.issues[0]?.message ?? 'Invalid value' });
    }
  }
  const known = new Set(fields.map((f) => f.key));
  for (const key of Object.keys(flat)) if (!known.has(key)) errors.push({ key, message: 'Unknown setting', unknown: true });
  return { value: unflatten(result), errors };
}
