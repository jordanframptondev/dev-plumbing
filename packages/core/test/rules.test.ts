import { describe, expect, it } from 'vitest';
import { parseRulesFile, resolveTypes, splitSections } from '../src/rules';
import { newRulesFileTemplate } from '../src/schemas';

const good = `---
id: database
title: Database
order: 2
screen: database
emptyMessage: This plan doesn't change the database.
---

## What to look for
- Tables.

## Rules
- Compare with the schema.
`;

describe('rules files', () => {
  it('parses a good file and fills header defaults', () => {
    const r = parseRulesFile('database.md', good);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.type).toMatchObject({ id: 'database', order: 2, screen: 'database', enabled: true, timeline: false, fields: [], answerPresets: [] });
    expect(r.type.sections.Rules).toBe('- Compare with the schema.');
  });

  it('rejects an id that does not match the file name', () => {
    const r = parseRulesFile('db.md', good);
    expect(r).toEqual({ ok: false, file: 'db.md', error: 'The id "database" must match the file name "db".' });
  });

  it('rejects a header with no screen', () => {
    const r = parseRulesFile('database.md', good.replace('screen: database\n', ''));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/screen/);
  });

  it('rejects broken YAML', () => {
    const r = parseRulesFile('database.md', '---\nid: [unclosed\n---\nbody');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/^The header isn't valid YAML/);
  });

  it('rejects a file with no header', () => {
    expect(parseRulesFile('database.md', '# Just text').ok).toBe(false);
  });

  it('splits the body into sections', () => {
    expect(splitSections('intro\n## A\none\n\n## B\ntwo\nthree')).toEqual({ A: 'one', B: 'two\nthree' });
  });

  it('sorts types by order, then title, and collects errors', () => {
    const results = [
      parseRulesFile('database.md', good),
      parseRulesFile('architecture.md', good.replace('id: database', 'id: architecture').replace('order: 2', 'order: 1')),
      { ok: false as const, file: 'broken.md', error: 'bad' },
    ];
    const { types, errors } = resolveTypes(results);
    expect(types.map((t) => t.id)).toEqual(['architecture', 'database']);
    expect(errors).toEqual([{ file: 'broken.md', error: 'bad' }]);
  });

  it('builds a new-type template that parses', () => {
    const r = parseRulesFile('rollout.md', newRulesFileTemplate('rollout', 'Rollout', 11));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.type).toMatchObject({ id: 'rollout', title: 'Rollout', order: 11, screen: 'list' });
  });
});
