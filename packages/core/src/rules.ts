import type matter from 'gray-matter';
import { parseFrontMatter, UnsafeFrontMatterError } from './frontMatter';
import { plumbingTypeHeaderSchema, type PlumbingType } from './schemas';

export type RulesFileResult = { ok: true; type: PlumbingType } | { ok: false; file: string; error: string };

export function splitSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  let current: string | null = null;
  let lines: string[] = [];
  const flush = () => {
    if (current) sections[current] = lines.join('\n').trim();
  };
  for (const line of body.split('\n')) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      flush();
      current = heading[1];
      lines = [];
    } else if (current) lines.push(line);
  }
  flush();
  return sections;
}

export function parseRulesFile(fileName: string, text: string): RulesFileResult {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = parseFrontMatter(text);
  } catch (e) {
    if (e instanceof UnsafeFrontMatterError) return { ok: false, file: fileName, error: e.message };
    return { ok: false, file: fileName, error: `The header isn't valid YAML: ${(e as Error).message.split('\n')[0]}` };
  }
  const header = plumbingTypeHeaderSchema.safeParse(parsed.data);
  if (!header.success) {
    const issue = header.error.issues[0];
    const field = issue?.path.join('.') || 'header';
    return { ok: false, file: fileName, error: `Header field "${field}": ${issue?.message ?? 'invalid'}.` };
  }
  const expectedId = fileName.replace(/\.md$/, '');
  if (header.data.id !== expectedId) {
    return { ok: false, file: fileName, error: `The id "${header.data.id}" must match the file name "${expectedId}".` };
  }
  return { ok: true, type: { ...header.data, file: fileName, body: parsed.content, sections: splitSections(parsed.content) } };
}

export function resolveTypes(results: RulesFileResult[]): { types: PlumbingType[]; errors: { file: string; error: string }[] } {
  const types: PlumbingType[] = [];
  const errors: { file: string; error: string }[] = [];
  for (const r of results) {
    if (r.ok) types.push(r.type);
    else errors.push({ file: r.file, error: r.error });
  }
  types.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  return { types, errors };
}
