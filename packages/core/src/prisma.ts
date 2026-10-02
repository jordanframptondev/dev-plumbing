/** The parts of a Prisma schema the database checks need. Field types are as written: 'String?', 'Order[]'. */
export type PrismaSchema = { models: Map<string, Map<string, string>>; enums: Set<string> };

const BLOCK_START = /^(model|enum|view|type|datasource|generator)\s+(\w+)\s*\{\s*(?:\/\/.*)?$/;
// A field's name, then its type: a plain or dotted name with ? or [] after it, or Unsupported("…") with ? after it.
const FIELD = /^(\w+)\s+(Unsupported\("(?:[^"\\]|\\.)*"\)\??|[A-Za-z_][\w.]*(?:\[\])?\??)/;

/** Reads model and enum blocks, line by line. Anything it doesn't understand is skipped, so it never throws. */
export function parsePrismaSchema(text: string): PrismaSchema {
  const models = new Map<string, Map<string, string>>();
  const enums = new Set<string>();
  let fields: Map<string, string> | null = null;
  let inBlock = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    if (!inBlock) {
      const start = BLOCK_START.exec(line);
      if (!start) continue;
      inBlock = true;
      if (start[1] === 'model') {
        fields = new Map();
        models.set(start[2], fields);
      } else if (start[1] === 'enum') {
        enums.add(start[2]);
      }
      continue;
    }
    if (line.startsWith('}')) {
      inBlock = false;
      fields = null;
      continue;
    }
    if (!fields || line.startsWith('@@')) continue;
    const field = FIELD.exec(line);
    if (field) fields.set(field[1], field[2]);
  }
  return { models, enums };
}
