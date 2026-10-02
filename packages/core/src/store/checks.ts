import fs from 'node:fs/promises';
import path from 'node:path';
import { parsePrismaSchema, type PrismaSchema } from '../prisma';
import { parseData, type DataChecks, type DataKind, type DiagramData, type RepoProfile, type TableDiff } from '../schemas';
import { verifyCodeRefs } from './importItems';

export type DataChecker = { check(kind: DataKind | null, data: unknown): Promise<DataChecks | null> };

type SchemaRead = { ok: true; file: string; schema: PrismaSchema } | { ok: false; reason: string };

/** The profile's Prisma schema, read from inside the clone. A path that leaves the clone, even through a link, isn't read. */
async function readSchema(clone: string | null, profile: RepoProfile | undefined): Promise<SchemaRead> {
  const schema = profile?.schema;
  if (!schema) return { ok: false, reason: 'No schema file is set in the repo profile.' };
  if (schema.type !== 'prisma') return { ok: false, reason: "The repo profile's schema isn't Prisma, so it isn't checked." };
  if (!clone) return { ok: false, reason: "The plan's clone isn't on this Mac any more." };
  const missing: SchemaRead = { ok: false, reason: `The schema file isn't in the clone: ${schema.path}.` };
  try {
    const root = await fs.realpath(clone);
    const file = await fs.realpath(path.resolve(root, schema.path));
    const rel = path.relative(root, file);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return missing;
    return { ok: true, file: schema.path, schema: parsePrismaSchema(await fs.readFile(file, 'utf8')) };
  } catch {
    return missing;
  }
}

/** Where one table diff disagrees with the schema as it is in the clone. */
function tableWarnings(table: TableDiff, schema: PrismaSchema): string[] {
  const model = schema.models.get(table.model);
  if (table.change === 'new') return model ? [`There's already a model called ${table.model} in the schema.`] : [];
  if (!model) return [`There's no model called ${table.model} in the schema.`];
  const warnings: string[] = [];
  for (const f of table.fields) {
    const name = `${table.model}.${f.name}`;
    const type = model.get(f.name);
    if (f.change === 'added') {
      if (type !== undefined) warnings.push(`${name} is added but already in the schema.`);
    } else if (type === undefined) {
      warnings.push(`${name} isn't in the schema.`);
    } else if (f.change === 'unchanged' && type.trimEnd() !== f.type.trimEnd()) {
      warnings.push(`${name} is ${type} in the schema, not ${f.type.trimEnd()}.`);
    }
  }
  return warnings;
}

/** ✓ for each box whose file reference is in the clone. With no clone, nothing is checked, and the reason says why. */
async function diagramChecks(clone: string | null, diagram: DiagramData): Promise<DataChecks> {
  if (!clone) return { kind: 'diagram', checked: false, reason: "The plan's clone isn't on this Mac any more.", nodes: {} };
  const refs = diagram.nodes.flatMap((n) => (n.codeRef ? [{ id: n.id, ref: n.codeRef }] : []));
  const verified = await verifyCodeRefs(clone, refs.map((r) => r.ref));
  return { kind: 'diagram', checked: true, nodes: Object.fromEntries(refs.map((r, i) => [r.id, verified[i]?.verified === true])) };
}

/** clone: the plan's clone (project.source.clone), or null if it's gone. Reads the schema file at most once. */
export function createDataChecker(o: { clone: string | null; profile: RepoProfile | undefined }): DataChecker {
  let schema: Promise<SchemaRead> | null = null;
  return {
    async check(kind, data) {
      if (kind === 'diagram') {
        const parsed = parseData('diagram', data);
        return parsed.ok ? diagramChecks(o.clone, parsed.data) : null;
      }
      if (kind === 'database') {
        const parsed = parseData('database', data);
        if (!parsed.ok) return null;
        schema ??= readSchema(o.clone, o.profile);
        const read = await schema;
        if (!read.ok) return { kind: 'database', checked: false, reason: read.reason, warnings: [] };
        return { kind: 'database', checked: true, file: read.file, warnings: tableWarnings(parsed.data, read.schema) };
      }
      return null;
    },
  };
}
