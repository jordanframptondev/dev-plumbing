import fs from 'node:fs/promises';
import path from 'node:path';

/** Kit files are read up to this many bytes in total. */
export const MAX_KIT_BYTES = 1024 * 1024;
const MAX_IMPORT_DEPTH = 5;
const COMMENT = /\/\*[\s\S]*?\*\//g;
// @import, and the Tailwind directives the in-browser compiler can't use. A @plugin may carry an options block.
const AT_RULE = /@(import|plugin|source|config|reference)\b([^;{]*)(?:;|\{[^}]*\})/g;

const isInside = (root: string, file: string) => {
  const rel = path.relative(root, file);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
};
const isCss = (file: string) => path.extname(file).toLowerCase() === '.css';

/** The path an @import names: "x.css", 'x.css', url(x.css) or url("x.css"). */
function importPath(params: string): string | null {
  return /^\s*(?:url\(\s*)?(['"]?)([^'")\s]+)\1/.exec(params)?.[2] ?? null;
}

/**
 * An app's design kit, from the plan's clone, ready for the Tailwind compiler inside a mockup frame.
 * - Only .css files inside the clone are read, at most 1 MB in total. Symlinks are followed only when they stay inside.
 * - Relative @imports are inlined (each file once, at most 5 deep); a layer or media condition on them is dropped.
 * - The kit's own Tailwind import is removed (the frame brings Tailwind), and so are the directives the browser can't use.
 * Problems never stop the kit. They come back as warnings, which the mockup's toolbar shows.
 */
export async function buildKitCss(o: { clone: string; files: string[] }): Promise<{ css: string; warnings: string[] }> {
  const real = await fs.realpath(o.clone).catch(() => null);
  if (!real) return { css: '', warnings: ["Kit: the plan's clone isn't on this Mac any more."] };
  const root: string = real;
  const warnings = new Set<string>();
  const seen = new Set<string>();
  let total = 0;
  const skip = (warning: string) => {
    warnings.add(warning);
    return '';
  };

  /** One kit file with its relative imports inlined, or '' when it can't be used. `name` is how warnings refer to it. */
  async function load(file: string, name: string, depth: number): Promise<string> {
    if (!isInside(root, file)) return skip(`Kit: ${name} isn't in the clone.`);
    if (!isCss(file)) return skip(`Kit: ${name} isn't a .css file.`);
    const target = await fs.realpath(file).catch(() => null);
    const stat = target && isInside(root, target) && isCss(target) ? await fs.stat(target).catch(() => null) : null;
    if (!target || !stat || !stat.isFile()) return skip(`Kit: ${name} isn't in the clone.`);
    if (seen.has(target)) return '';
    seen.add(target);
    if (total + stat.size > MAX_KIT_BYTES) return skip(`Kit: skipped ${name}, because kit files are limited to 1 MB in total.`);
    total += stat.size;
    const raw = await fs.readFile(target, 'utf8').catch(() => null);
    if (raw === null) return skip(`Kit: ${name} couldn't be read.`);
    // Comments go first, so a commented-out @import is neither inlined nor warned about.
    const text = raw.replace(COMMENT, '');
    let css = '';
    let at = 0;
    for (const m of text.matchAll(AT_RULE)) {
      const start = m.index ?? 0;
      css += text.slice(at, start);
      at = start + m[0].length;
      css += await rewrite(m[1] ?? '', m[2] ?? '', path.dirname(target), depth);
    }
    css += text.slice(at);
    return `/* ${path.relative(root, target)} */\n${css.trim()}\n`;
  }

  /** What replaces one @import or directive: an inlined file, or nothing. */
  async function rewrite(directive: string, params: string, dir: string, depth: number): Promise<string> {
    if (directive !== 'import') return skip(`Kit: @${directive} lines skipped (they don't work in mockups).`);
    const spec = importPath(params);
    if (spec === 'tailwindcss' || spec?.startsWith('tailwindcss/')) return '';
    if (!spec || !/^\.\.?\//.test(spec)) return skip(`Kit: skipped @import "${spec ?? params.trim()}".`);
    if (depth >= MAX_IMPORT_DEPTH) return skip(`Kit: skipped @import "${spec}", because imports nest more than ${MAX_IMPORT_DEPTH} deep.`);
    return load(path.resolve(dir, spec), spec, depth + 1);
  }

  const parts: string[] = [];
  for (const file of o.files) parts.push(await load(path.resolve(root, file), file, 0));
  return { css: parts.filter(Boolean).join('\n'), warnings: [...warnings] };
}
