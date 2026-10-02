export type Heading = { level: number; text: string; line: number };

const FENCE = /^\s*(```|~~~)/;
const ATX = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** ATX headings (# to ######), ignoring lines inside code fences. `line` is 0-based. */
export function headingsOf(md: string): Heading[] {
  const out: Heading[] = [];
  let fenced = false;
  md.split('\n').forEach((line, i) => {
    if (FENCE.test(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    const m = ATX.exec(line);
    if (m) out.push({ level: m[1].length, text: m[2].trim(), line: i });
  });
  return out;
}

/** The section that starts at `heading` (matched ignoring case and spacing), up to the next heading at the same or a higher level. */
export function sectionFor(md: string, heading: string): string | null {
  const hs = headingsOf(md);
  const i = hs.findIndex((h) => norm(h.text) === norm(heading));
  if (i < 0) return null;
  const start = hs[i];
  const next = hs.slice(i + 1).find((h) => h.level <= start.level);
  const lines = md.split('\n');
  return lines.slice(start.line, next ? next.line : lines.length).join('\n').trimEnd();
}

export function titleFromMarkdown(md: string): string | null {
  return headingsOf(md).find((h) => h.level === 1)?.text ?? null;
}

/** The first paragraph of prose, joined onto one line and cut to `max` characters. */
export function firstParagraph(md: string, max = 600): string {
  let fenced = false;
  const para: string[] = [];
  for (const line of md.split('\n')) {
    if (FENCE.test(line)) {
      fenced = !fenced;
      if (para.length) break;
      continue;
    }
    if (fenced) continue;
    if (ATX.test(line) || !line.trim()) {
      if (para.length) break;
      continue;
    }
    para.push(line.trim());
  }
  const text = para.join(' ');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
