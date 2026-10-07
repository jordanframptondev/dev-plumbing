import { describe, expect, it } from 'vitest';
import { DEFENSE_SECTIONS, type Basis, type DefenseSectionId } from '../src/schemas';
import { claimAt, defenseMarkdown, defensePartMarkdown } from '../src/store/defenseMarkdown';
import { storedDefense } from './fixtures';

const CLAIMS: Record<DefenseSectionId, [string, Basis]> = {
  summary: ['A daily job reminds customers before an item runs out.', 'known'],
  diagram: ['The job reads subscriptions and sends email.', 'inferred'],
  walkthrough: ['The job runs at 9am and finds subscriptions due in 3 days.', 'known'],
  data: ['Each reminder sent is logged once.', 'known'],
  security: ['Who can turn reminders off?', 'unknown'],
  failure: ['A rerun on the same day sends nothing twice.', 'verify'],
  tradeoffs: ['A daily job is simpler than a queue.', 'inferred'],
  complexity: ['One job and one table.', 'known'],
  readiness: ['Sends are logged with the job run id.', 'verify'],
  unknowns: ['How many reminders go out on the first day.', 'unknown'],
};

/** A small defense: one claim per section, a table, a text diagram, a diagram item, one question, one concern, two checklist lines. */
const small = () =>
  storedDefense({
    generatedAt: '2026-10-06T09:30:00.000Z',
    basedOn: { kind: 'plan', doc: 'draft', version: 2, inputsHash: 'h' },
    level: 3,
    levelReasons: ['It sends email to customers.', 'It stores who was reminded.'],
    sections: DEFENSE_SECTIONS.map((s) => ({
      id: s.id,
      title: s.title,
      claims: [{ text: CLAIMS[s.id][0], basis: CLAIMS[s.id][1] }],
      tables: s.id === 'data' ? [{ title: 'Source of truth', columns: ['Data', 'Owner'], rows: [['Reminder', 'reminders table']] }] : [],
      diagram: s.id === 'diagram' ? 'job --> email' : null,
      diagramItemId: s.id === 'diagram' ? 'architecture-system' : null,
    })),
    questions: [{ id: 'q1', q: 'What if the job runs twice?', a: 'It checks sentAt first, so nobody gets two.', basis: 'inferred' }],
    concerns: [{ id: 'c1', severity: 'high', text: 'A rerun could send duplicates.', basis: 'verify' }],
    checklist: [
      { id: 'k1', text: 'I can explain the purpose.' },
      { id: 'k2', text: 'I can draw the system flow.' },
    ],
  });

const EXPECTED = `# Whiteboard Defense: Restock reminders

Level 3 (High risk). Generated 2026-10-06 from the draft (v2).

- It sends email to customers.
- It stores who was reminded.

## 1. Executive summary

- A daily job reminds customers before an item runs out. *(Known)*

## 2. Whiteboard diagram

- The job reads subscriptions and sends email. *(Inferred)*

Diagram: System view (in dev-plumbing).

\`\`\`text
job --> email
\`\`\`

## 3. System walkthrough

- The job runs at 9am and finds subscriptions due in 3 days. *(Known)*

## 4. Data and state

- Each reminder sent is logged once. *(Known)*

**Source of truth**

| Data | Owner |
| --- | --- |
| Reminder | reminders table |

## 5. Security model

- Who can turn reminders off? *(Unknown)*

## 6. Failure analysis

- A rerun on the same day sends nothing twice. *(Verify before release)*

## 7. Dependencies and tradeoffs

- A daily job is simpler than a queue. *(Inferred)*

## 8. Complexity review

- One job and one table. *(Known)*

## 9. Production readiness

- Sends are logged with the job run id. *(Verify before release)*

## 10. Questions the engineer should be able to answer

**What if the job runs twice?**

It checks sentAt first, so nobody gets two. *(Inferred)*

## 11. Release concerns

- **High:** A rerun could send duplicates. *(Verify before release)*

## 12. Unknowns

- How many reminders go out on the first day. *(Unknown)*

## 13. Checklist

- [ ] I can explain the purpose.
- [ ] I can draw the system flow.
`;

describe('the Whiteboard Defense as Markdown', () => {
  it('writes the whole defense in the 13 sections, in order', () => {
    expect(defenseMarkdown(small(), { title: 'Restock reminders', itemTitles: { 'architecture-system': 'System view' } })).toBe(EXPECTED);
  });

  it("names a diagram item by its id when its title isn't given", () => {
    expect(defenseMarkdown(small(), { title: 'Restock reminders' })).toContain('Diagram: architecture-system (in dev-plumbing).');
  });

  it("draws a section's diagram item as Mermaid under its line, when it's given", () => {
    const mermaid = '```mermaid\nflowchart LR\n  n_job["Reminder job"]\n```';
    const markdown = defenseMarkdown(small(), { title: 'Restock reminders', itemTitles: { 'architecture-system': 'System view' }, diagrams: { 'architecture-system': mermaid } });
    expect(markdown).toContain(`Diagram: System view (in dev-plumbing).\n\n${mermaid}\n\n\`\`\`text\njob --> email\n\`\`\``);
    // A part's Markdown, for a Defense item's body, only names it.
    expect(defensePartMarkdown(small(), 'section', 'diagram')).not.toContain('mermaid');
  });

  it('escapes a | in a table, and keeps each row on one line', () => {
    const d = small();
    const tables = [{ title: 'Who sends', columns: ['Path | route', 'Note'], rows: [['/jobs | /cron', 'two\nlines']] }];
    const markdown = defenseMarkdown({ ...d, sections: d.sections.map((s) => (s.id === 'data' ? { ...s, tables } : s)) }, { title: 'Restock reminders' });
    expect(markdown).toContain('**Who sends**\n\n| Path \\| route | Note |\n| --- | --- |\n| /jobs \\| /cron | two lines |\n');
  });

  it('says None. when there are no release concerns', () => {
    const markdown = defenseMarkdown(storedDefense({ concerns: [] }), { title: 'Restock reminders' });
    expect(markdown).toContain('## 11. Release concerns\n\nNone.\n\n## 12. Unknowns');
  });

  it('keeps a statement over several lines in one list item, and a diagram with backticks in its fence', () => {
    const d = small();
    const sections = d.sections.map((s) =>
      s.id === 'summary' ? { ...s, claims: [{ text: 'First line.\nSecond line.', basis: 'known' as const }] } : s.id === 'diagram' ? { ...s, diagram: 'a ```b``` c' } : s,
    );
    const markdown = defenseMarkdown({ ...d, sections }, { title: 'Restock reminders' });
    expect(markdown).toContain('- First line.\n  Second line. *(Known)*');
    expect(markdown).toContain('````text\na ```b``` c\n````');
  });
});

describe('one part of the defense as Markdown', () => {
  it('gives a section, a question or a concern as its block, with its heading', () => {
    const d = small();
    expect(defensePartMarkdown(d, 'section', 'security')).toBe('## 5. Security model\n\n- Who can turn reminders off? *(Unknown)*');
    expect(defensePartMarkdown(d, 'section', 'diagram', { itemTitles: { 'architecture-system': 'System view' } })).toBe(
      '## 2. Whiteboard diagram\n\n- The job reads subscriptions and sends email. *(Inferred)*\n\nDiagram: System view (in dev-plumbing).\n\n```text\njob --> email\n```',
    );
    expect(defensePartMarkdown(d, 'question', 'q1')).toBe(
      '## 10. Questions the engineer should be able to answer\n\n**What if the job runs twice?**\n\nIt checks sentAt first, so nobody gets two. *(Inferred)*',
    );
    expect(defensePartMarkdown(d, 'concern', 'c1')).toBe('## 11. Release concerns\n\n- **High:** A rerun could send duplicates. *(Verify before release)*');
  });

  it("is null for a part the defense doesn't have", () => {
    const d = small();
    expect(defensePartMarkdown(d, 'section', 'nope')).toBeNull();
    expect(defensePartMarkdown(d, 'question', 'q2')).toBeNull();
    expect(defensePartMarkdown(d, 'concern', 'c9')).toBeNull();
  });

  it('finds a claim by its section and index', () => {
    const d = small();
    expect(claimAt(d, 'security.0')).toEqual({ section: d.sections[4], n: 5, claim: { text: 'Who can turn reminders off?', basis: 'unknown' } });
    expect(claimAt(d, 'unknowns.0')?.n).toBe(12);
    for (const bad of ['security.1', 'security.01', 'security.-1', 'security', 'nope.0', '.0', '']) expect(claimAt(d, bad), bad).toBeNull();
  });
});
