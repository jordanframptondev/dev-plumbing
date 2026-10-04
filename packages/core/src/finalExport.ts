import {
  dataKindOf,
  parseData,
  type DataKind,
  type DiagramData,
  type FlowData,
  type Item,
  type PlumbingType,
  type TableDiff,
} from './schemas';

// The final's drawings and schema blocks, generated from the items' data (spec §10.7). The finalizer only places
// tokens; expandTokens swaps each for the block made here, so Mermaid is always valid and always matches the data.

const ENTITY: Record<string, string> = { '"': '#quot;', '`': '#96;', ';': '#59;', '%': '#37;', '<': '#lt;', '>': '#gt;' };

/** One line of plain text: runs of whitespace, newlines included, become one space. */
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * Text Mermaid reads literally: one line, with quotes, backticks, semicolons, percent signs and angle brackets as
 * Mermaid entity codes. A quote would end a label, a backtick starts a Markdown label, a semicolon ends a statement in
 * a sequence diagram, %%{ starts a directive even inside a label, and angle brackets would be read as HTML (a type
 * like Map<string, Item> would vanish).
 */
const mermaidText = (text: string) => oneLine(text).replace(/["`;%<>]/g, (c) => ENTITY[c]);

/** A fenced code block whose fence is longer than any run of backticks inside it. */
function fenced(lang: string, body: string): string {
  const longest = Math.max(0, ...[...body.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}${lang}\n${body}\n${fence}`;
}

/**
 * Mermaid ids for data ids: the prefix, then the id with anything but letters, digits and _ turned into _, so no id
 * can be a keyword or break the syntax. Two ids that come out the same get _2, _3 after the later one.
 */
function safeIds(prefix: string, ids: string[]): (id: string) => string {
  const plain = (id: string) => `${prefix}${id.replace(/[^A-Za-z0-9_]/g, '_')}`;
  const map = new Map<string, string>();
  const used = new Set<string>();
  for (const id of ids) {
    if (map.has(id)) continue;
    let safe = plain(id);
    for (let n = 2; used.has(safe); n++) safe = `${plain(id)}_${n}`;
    used.add(safe);
    map.set(id, safe);
  }
  return (id) => map.get(id) ?? plain(id);
}

const CLASS_DEFS = [
  '  classDef new stroke:#5f8a5b',
  '  classDef changed stroke:#c07a2c',
  '  classDef unchanged stroke:#cbcbcb',
  '  classDef external stroke-dasharray:4 3',
];

/** A fenced Mermaid flowchart: one subgraph per group, dashed lines as -.->, each box's status as its class. */
export function diagramMermaid(d: DiagramData): string {
  const node = safeIds('n_', d.nodes.map((n) => n.id));
  const group = safeIds('g_', d.groups.map((g) => g.id));
  const box = (n: DiagramData['nodes'][number], indent: string) => `${indent}${node(n.id)}["${mermaidText(n.label) || mermaidText(n.id)}"]`;
  const groupIds = new Set(d.groups.map((g) => g.id));
  const lines = ['flowchart LR'];
  for (const g of d.groups) {
    const members = d.nodes.filter((n) => n.group === g.id);
    if (members.length) lines.push(`  subgraph ${group(g.id)}["${mermaidText(g.label)}"]`, ...members.map((n) => box(n, '    ')), '  end');
  }
  for (const n of d.nodes) if (n.group === undefined || !groupIds.has(n.group)) lines.push(box(n, '  '));
  for (const e of d.edges) {
    const label = mermaidText(e.label ?? '');
    lines.push(`  ${node(e.from)} ${e.style === 'dashed' ? '-.->' : '-->'}${label ? `|"${label}"|` : ''} ${node(e.to)}`);
  }
  lines.push(...CLASS_DEFS, ...d.nodes.map((n) => `  class ${node(n.id)} ${n.status}`));
  return fenced('mermaid', lines.join('\n'));
}

/**
 * A fenced Mermaid sequence diagram, numbered with autonumber. Lanes are the participants. A step with from and to is
 * an arrow (a self-call when they're the same lane); one with only one of them is a note over that lane, and one with
 * neither a note across all the lanes. Notes carry their step number, and autonumber restarts where a step's number
 * would otherwise drift. A step's systemNote is a note beside the lane it ends on.
 */
export function sequenceMermaid(f: FlowData): string {
  // A user flow has no lanes; it never reaches here through a token, but it still makes valid Mermaid.
  const lanes = f.lanes?.length ? f.lanes : [{ id: 'flow', label: 'Flow' }];
  const lane = safeIds('l_', lanes.map((l) => l.id));
  const first = lane(lanes[0].id);
  const across = lanes.length > 1 ? `${first},${lane(lanes[lanes.length - 1].id)}` : first;
  const lines = ['sequenceDiagram', '  autonumber', ...lanes.map((l) => `  participant ${lane(l.id)} as ${mermaidText(l.label) || lane(l.id)}`)];
  let next = 1;
  for (const s of [...f.steps].sort((a, b) => a.n - b.n)) {
    const label = mermaidText(s.label);
    if (s.from !== undefined && s.to !== undefined) {
      if (s.n !== next) lines.push(`  autonumber ${s.n}`);
      lines.push(`  ${lane(s.from)}->>${lane(s.to)}: ${label}`);
      next = s.n + 1;
    } else {
      const over = s.from ?? s.to;
      lines.push(`  Note over ${over === undefined ? across : lane(over)}: ${s.n}. ${label}`);
    }
    const note = mermaidText(s.systemNote ?? '');
    if (note) {
      const at = s.to ?? s.from;
      lines.push(`  Note right of ${at === undefined ? first : lane(at)}: ${note}`);
    }
  }
  return fenced('mermaid', lines.join('\n'));
}

/** Numbered Markdown steps for a user flow. A step's systemNote is a "System:" line under it. */
export function userFlowSteps(f: FlowData): string {
  return [...f.steps]
    .sort((a, b) => a.n - b.n)
    .flatMap((s) => {
      const marker = `${s.n}. `;
      const note = oneLine(s.systemNote ?? '');
      return [`${marker}${oneLine(s.label)}`, ...(note ? [`${' '.repeat(marker.length)}- System: ${note}`] : [])];
    })
    .join('\n');
}

/** The table's schema diff, exactly as agreed, in a fenced diff block. */
export function schemaBlock(t: TableDiff): string {
  return fenced('diff', t.schemaDiff.replace(/(\r?\n)+$/, ''));
}

/** The Database screen's names for each kind of migration step. */
const MIGRATION_LABEL: Record<NonNullable<TableDiff['migration']>[number]['kind'], string> = {
  additive: 'Additive',
  backfill: 'Backfill',
  destructive: 'Destructive',
  'data-risk': 'Data risk',
  rollback: 'Rollback',
};

/** The migration notes as a Markdown list: "- **Rollback:** text", in the order written. */
export function migrationList(t: TableDiff): string {
  return (t.migration ?? []).map((m) => `- **${MIGRATION_LABEL[m.kind]}:** ${oneLine(m.text)}`).join('\n');
}

/** The file a mockup is copied to, inside `<name>.assets/`. */
export function mockupAssetName(itemId: string, side: 'after' | 'before'): string {
  return `${itemId}.${side}.html`;
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => HTML_ESCAPES[c]);
/** Text for an HTML comment: one line, and never two dashes in a row, which could end the comment early. */
const commentText = (text: string) => oneLine(text).replace(/-(?=-)/g, '- ');

/**
 * A mockup as a plain HTML file for the repo: the body markup in a minimal document, with a comment at the top naming
 * the app, route and kit files. No script and no styles: the classes are the app's own, so an implementer reads them.
 */
export function mockupAssetHtml(o: { title: string; app: string; route?: string; kitFiles: string[]; body: string }): string {
  const where = [`app ${o.app}`, ...(o.route ? [`route ${o.route}`] : []), `kit files: ${o.kitFiles.length ? o.kitFiles.join(', ') : 'none'}`].join(', ');
  return [
    '<!doctype html>',
    `<!-- dev-plumbing mockup: ${commentText(where)}. The classes are the app's own; this file has no styles. -->`,
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(oneLine(o.title))}</title>`,
    '</head>',
    '<body>',
    o.body,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

export const TOKEN_PATTERN = /\{\{(diagram|sequence|steps|schema|migration|mockup):([a-z0-9][a-z0-9-]*)(?::(after|before))?\}\}/g;
export type TokenContext = { items: Item[]; types: PlumbingType[]; assetsDir: string };

type TokenKind = 'diagram' | 'sequence' | 'steps' | 'schema' | 'migration' | 'mockup';
type TokenData = Exclude<DataKind, 'timeline'>;
type Side = 'after' | 'before';
type Expansion = { ok: true; text: string; asset?: { itemId: string; side: Side } } | { ok: false; problem: string };

/** Tokens that become a fence or a list, so they need a line of their own. Mockup links can go anywhere. */
const BLOCK_TOKENS = new Set<string>(['diagram', 'sequence', 'steps', 'schema', 'migration']);
/** The data kind each token reads, and how a problem names it. */
const TOKEN_DATA: Record<TokenKind, TokenData> = { diagram: 'diagram', sequence: 'flows', steps: 'flows', schema: 'database', migration: 'database', mockup: 'mockups' };
const ITEM_NAME: Record<TokenData, string> = { diagram: 'a diagram item', flows: 'a flow item', database: 'a database item', mockups: 'a UI item' };
const DATA_NAME: Record<TokenData, string> = { diagram: 'diagram data', flows: 'flow data', database: 'table data', mockups: 'mockup data' };
/** Anything left that looks like a token: up to its closing braces on the same line, or the next few characters. */
const LEFTOVER = /\{\{[^\n]{0,100}?\}\}|\{\{[^\n]{0,20}/g;
const ITEM_ID = /^[a-z0-9][a-z0-9-]*$/;

/** The item's data kind from its plumbing type: null for plain lists and items whose type is gone. */
function kindOf(item: Item, types: PlumbingType[]): DataKind | null {
  const type = types.find((t) => t.id === item.type);
  return type ? dataKindOf(type) : null;
}

/** A link a Markdown renderer won't misread: spaces, parentheses and other unsafe characters percent-encoded. */
const linkPath = (p: string) => encodeURI(p).replace(/\(/g, '%28').replace(/\)/g, '%29');

function expandToken(kind: TokenKind, itemId: string, side: Side | undefined, ctx: TokenContext): Expansion {
  const no = (problem: string): Expansion => ({ ok: false, problem });
  const item = ctx.items.find((i) => i.id === itemId);
  if (!item) return no(`there's no item "${itemId}".`);
  if (kind !== 'mockup' && side) return no('only mockup tokens take :after or :before.');
  const want = TOKEN_DATA[kind];
  if (kindOf(item, ctx.types) !== want) return no(`"${item.title}" isn't ${ITEM_NAME[want]}.`);
  const missing = no(`"${item.title}" has no ${DATA_NAME[want]}.`);
  if (kind === 'diagram') {
    const d = parseData('diagram', item.data);
    return d.ok ? { ok: true, text: diagramMermaid(d.data) } : missing;
  }
  if (kind === 'sequence' || kind === 'steps') {
    const f = parseData('flows', item.data);
    if (!f.ok) return missing;
    if (kind === 'sequence' && f.data.kind === 'user') return no(`that flow is a user flow; use {{steps:${itemId}}}.`);
    if (kind === 'steps' && f.data.kind === 'system') return no(`that flow is a system flow; use {{sequence:${itemId}}}.`);
    return { ok: true, text: kind === 'sequence' ? sequenceMermaid(f.data) : userFlowSteps(f.data) };
  }
  if (kind === 'schema' || kind === 'migration') {
    const t = parseData('database', item.data);
    if (!t.ok) return missing;
    if (kind === 'schema') return t.data.schemaDiff.trim() ? { ok: true, text: schemaBlock(t.data) } : no(`"${item.title}" has no schema diff.`);
    return t.data.migration?.length ? { ok: true, text: migrationList(t.data) } : no(`"${item.title}" has no migration notes.`);
  }
  const m = parseData('mockups', item.data);
  if (!m.ok) return missing;
  if (!side) return no(`say which side: {{mockup:${itemId}:after}} or {{mockup:${itemId}:before}}.`);
  if (!m.data[side]?.trim()) return no(`"${item.title}" has no ${side} mockup.`);
  const href = linkPath(`${ctx.assetsDir}/${mockupAssetName(itemId, side)}`);
  return { ok: true, text: `[${side === 'after' ? 'After' : 'Before'} mockup](${href})`, asset: { itemId, side } };
}

/** Indents every line after the first, except empty ones, so a block keeps its place in a list. */
const indentLines = (text: string, indent: string) => (indent ? text.replace(/\n(?!\n|$)/g, `\n${indent}`) : text);

/** Replaces every token. Problems name each bad token; any problem means no output. */
export function expandTokens(
  markdown: string,
  ctx: TokenContext,
): { ok: true; markdown: string; assets: { itemId: string; side: 'after' | 'before' }[] } | { ok: false; problems: string[] } {
  const problems: string[] = [];
  const problem = (text: string) => {
    if (!problems.includes(text)) problems.push(text);
  };
  const assets: { itemId: string; side: Side }[] = [];
  let out = '';
  // The finalizer's own text, with each token replaced by a space, for the leftover check.
  let own = '';
  let last = 0;
  for (const m of markdown.matchAll(new RegExp(TOKEN_PATTERN.source, 'g'))) {
    const token = m[0];
    const kind = m[1] as TokenKind;
    const at = m.index ?? 0;
    out += markdown.slice(last, at);
    own += `${markdown.slice(last, at)} `;
    last = at + token.length;
    const r = expandToken(kind, m[2], m[3] as Side | undefined, ctx);
    if (!r.ok) {
      problem(`${token}: ${r.problem}`);
      continue;
    }
    if (BLOCK_TOKENS.has(kind)) {
      const lineStart = markdown.lastIndexOf('\n', at - 1) + 1;
      const lineEnd = markdown.indexOf('\n', last);
      const before = markdown.slice(lineStart, at);
      if (before.trim() || markdown.slice(last, lineEnd === -1 ? undefined : lineEnd).trim()) {
        problem(`${token}: put this token on a line of its own.`);
        continue;
      }
      out += indentLines(r.text, before);
    } else {
      out += r.text;
    }
    const asset = r.asset;
    if (asset && !assets.some((a) => a.itemId === asset.itemId && a.side === asset.side)) assets.push(asset);
  }
  out += markdown.slice(last);
  own += markdown.slice(last);
  for (const left of own.matchAll(LEFTOVER)) problem(`Unknown token: ${left[0]}.`);
  return problems.length ? { ok: false, problems } : { ok: true, markdown: out, assets };
}

/** The token list a finalizer may use for these items, one line each, for its context pack. */
export function availableTokens(items: Item[], types: PlumbingType[]): string[] {
  const order = (i: Item) => types.find((t) => t.id === i.type)?.order ?? Number.MAX_SAFE_INTEGER;
  const lines: string[] = [];
  for (const item of [...items].sort((a, b) => order(a) - order(b) || a.title.localeCompare(b.title))) {
    if (!ITEM_ID.test(item.id)) continue;
    const id = item.id;
    const title = `"${item.title}"`;
    const kind = kindOf(item, types);
    if (kind === 'diagram' && parseData('diagram', item.data).ok) lines.push(`{{diagram:${id}}}: the Mermaid flowchart of ${title}.`);
    if (kind === 'flows') {
      const f = parseData('flows', item.data);
      if (f.ok && f.data.kind !== 'user') lines.push(`{{sequence:${id}}}: the Mermaid sequence diagram of ${title}.`);
      if (f.ok && f.data.kind !== 'system') lines.push(`{{steps:${id}}}: the numbered steps of ${title}.`);
    }
    if (kind === 'database') {
      const t = parseData('database', item.data);
      if (t.ok && t.data.schemaDiff.trim()) lines.push(`{{schema:${id}}}: the schema diff of ${title}.`);
      if (t.ok && t.data.migration?.length) lines.push(`{{migration:${id}}}: the migration notes of ${title}.`);
    }
    if (kind === 'mockups') {
      const m = parseData('mockups', item.data);
      for (const side of ['after', 'before'] as const) {
        if (m.ok && m.data[side]?.trim()) lines.push(`{{mockup:${id}:${side}}}: a link to the ${side} mockup of ${title}, copied into the assets folder.`);
      }
    }
  }
  return lines;
}
