import {
  BASIS_LABELS,
  DEFENSE_PARTS,
  DEFENSE_SECTIONS,
  LEVEL_NAMES,
  SEVERITY_LABELS,
  type Basis,
  type Claim,
  type DefenseTable,
  type WhiteboardDefense,
} from '../schemas';

type Section = WhiteboardDefense['sections'][number];
type Question = WhiteboardDefense['questions'][number];
type Concern = WhiteboardDefense['concerns'][number];
/** Item titles by id, for a section's diagramItemId. An id with no title here is shown as the id. */
type ItemTitles = Record<string, string>;
/** Item diagrams by id, each a fenced Mermaid block (finalExport's diagramMermaid), drawn under a section's Diagram line. */
type ItemDiagrams = Record<string, string>;

/** A list item. Lines after the first are indented, so a statement over several lines stays one item. */
const bullet = (text: string) => `- ${text.split('\n').map((line, i) => (i === 0 || line === '' ? line : `  ${line}`)).join('\n')}`;
const tagged = (text: string, basis: Basis) => `${text} *(${BASIS_LABELS[basis]})*`;
const heading = (n: number, title: string) => `## ${n}. ${title}`;
/** A heading and the blocks under it, or "None." when there are none. */
const under = (head: string, blocks: string[]) => [head, ...(blocks.length ? blocks : ['None.'])].join('\n\n');
/** A table cell (or column): a | would end the cell, and a newline the row. */
const cell = (text: string) => text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');

function table(t: DefenseTable): string {
  const row = (cells: string[]) => `| ${cells.map(cell).join(' | ')} |`;
  return [`**${t.title}**`, '', row(t.columns), row(t.columns.map(() => '---')), ...t.rows.map(row)].join('\n');
}

/** A plain-text diagram, fenced with more backticks than any run inside it, so it can't close its own fence. */
function fenced(diagram: string): string {
  const longest = Math.max(0, ...(diagram.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}text\n${diagram.replace(/\n+$/, '')}\n${fence}`;
}

const numberOf = (id: Section['id']) => DEFENSE_SECTIONS.find((s) => s.id === id)?.n ?? 0;

/** A prose section: its claims, the project's diagram it names (drawn too, when it's given), its tables, then its text diagram. */
function sectionBlock(s: Section, titles: ItemTitles, diagrams: ItemDiagrams = {}): string {
  const blocks: string[] = [];
  if (s.claims.length) blocks.push(s.claims.map((c) => bullet(tagged(c.text, c.basis))).join('\n'));
  if (s.diagramItemId) {
    blocks.push(`Diagram: ${titles[s.diagramItemId] ?? s.diagramItemId} (in dev-plumbing).`);
    if (diagrams[s.diagramItemId]) blocks.push(diagrams[s.diagramItemId]);
  }
  for (const t of s.tables) blocks.push(table(t));
  if (s.diagram?.trim()) blocks.push(fenced(s.diagram));
  return under(heading(numberOf(s.id), s.title), blocks);
}

const questionBlock = (q: Question) => `**${q.q}**\n\n${tagged(q.a, q.basis)}`;
const concernLine = (c: Concern) => bullet(tagged(`**${SEVERITY_LABELS[c.severity]}:** ${c.text}`, c.basis));
const questionsHeading = heading(DEFENSE_PARTS.questions.n, DEFENSE_PARTS.questions.title);
const concernsHeading = heading(DEFENSE_PARTS.concerns.n, DEFENSE_PARTS.concerns.title);

/**
 * The whole defense as one Markdown document, for Export .md and a thread's pack: the level and its reasons, then the
 * 13 sections in order (1–9, 10 Questions, 11 Release concerns, 12 Unknowns, 13 Checklist). `title` is the project's.
 * `itemTitles` names the item a section's diagramItemId points at, and `diagrams` (Export .md's) draws it as Mermaid,
 * for a reader of the repo who can't see dev-plumbing.
 */
export function defenseMarkdown(d: WhiteboardDefense, o: { title: string; itemTitles?: ItemTitles; diagrams?: ItemDiagrams }): string {
  const titles = o.itemTitles ?? {};
  const parts: { n: number; text: string }[] = [
    ...DEFENSE_SECTIONS.flatMap(({ id, n }) => {
      const s = d.sections.find((x) => x.id === id);
      return s ? [{ n, text: sectionBlock(s, titles, o.diagrams) }] : [];
    }),
    { n: DEFENSE_PARTS.questions.n, text: under(questionsHeading, d.questions.map(questionBlock)) },
    { n: DEFENSE_PARTS.concerns.n, text: under(concernsHeading, d.concerns.length ? [d.concerns.map(concernLine).join('\n')] : []) },
    {
      n: DEFENSE_PARTS.checklist.n,
      text: under(heading(DEFENSE_PARTS.checklist.n, DEFENSE_PARTS.checklist.title), d.checklist.length ? [d.checklist.map((k) => `- [ ] ${k.text}`).join('\n')] : []),
    },
  ].sort((a, b) => a.n - b.n);
  const head = [
    `# Whiteboard Defense: ${o.title}`,
    `Level ${d.level} (${LEVEL_NAMES[d.level]}). Generated ${d.generatedAt.slice(0, 10)} from the ${d.basedOn.doc} (v${d.basedOn.version}).`,
    ...(d.levelReasons.length ? [d.levelReasons.map(bullet).join('\n')] : []),
  ];
  return `${[...head, ...parts.map((p) => p.text)].join('\n\n')}\n`;
}

/**
 * One part of the defense, as its block in the whole document with its heading: a section (by id), a question (q<n>) or
 * a release concern (c<n>). A Defense item's body. Null when the defense has no such part.
 */
export function defensePartMarkdown(d: WhiteboardDefense, kind: 'section' | 'question' | 'concern', ref: string, o: { itemTitles?: ItemTitles } = {}): string | null {
  if (kind === 'section') {
    const s = d.sections.find((x) => x.id === ref);
    return s ? sectionBlock(s, o.itemTitles ?? {}) : null;
  }
  if (kind === 'question') {
    const q = d.questions.find((x) => x.id === ref);
    return q ? under(questionsHeading, [questionBlock(q)]) : null;
  }
  const c = d.concerns.find((x) => x.id === ref);
  return c ? under(concernsHeading, [concernLine(c)]) : null;
}

/** The claim a ref names (`${sectionId}.${index}`, the index from 0), with its section and that section's number. */
export function claimAt(d: WhiteboardDefense, ref: string): { section: Section; n: number; claim: Claim } | null {
  const m = /^([a-z]+)\.(0|[1-9]\d*)$/.exec(ref);
  const section = m ? d.sections.find((s) => s.id === m[1]) : undefined;
  const claim = section?.claims[Number(m?.[2])];
  return section && claim ? { section, n: numberOf(section.id), claim } : null;
}
