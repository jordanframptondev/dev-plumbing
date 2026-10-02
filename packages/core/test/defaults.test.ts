import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRulesFile, resolveTypes } from '../src/rules';
import { defaultAgents, defaultSettings } from '../src/schemas';

const defaults = path.resolve(import.meta.dirname, '../../../defaults');
const read = (rel: string) => fs.readFileSync(path.join(defaults, rel), 'utf8');

describe('shipped defaults', () => {
  it('settings.json matches the code defaults', () => {
    expect(JSON.parse(read('settings.json'))).toEqual(defaultSettings);
  });

  it('agents.json matches the code defaults', () => {
    expect(JSON.parse(read('agents.json'))).toEqual(defaultAgents);
  });

  it('ships the ten plumbing types from the spec, all valid', () => {
    const files = fs.readdirSync(path.join(defaults, 'plumbing')).filter((f) => f.endsWith('.md'));
    const results = files.map((f) => parseRulesFile(f, read(`plumbing/${f}`)));
    expect(results.filter((r) => !r.ok)).toEqual([]);
    const { types } = resolveTypes(results);
    expect(types.map((t) => [t.id, t.screen])).toEqual([
      ['architecture', 'diagram'],
      ['database', 'database'],
      ['ui', 'mockups'],
      ['flows', 'flows'],
      ['questions', 'list'],
      ['concerns', 'list'],
      ['ideas', 'list'],
      ['phases', 'list'],
      ['testing', 'list'],
      ['security', 'list'],
    ]);
    expect(new Set(types.map((t) => t.order)).size).toBe(10);
    for (const t of types) {
      for (const s of ['What to look for', 'Rules', 'Done when', 'Always ask']) {
        expect(t.sections[s], `${t.id} is missing "${s}"`).toBeTruthy();
      }
    }
  });

  it('gives lists their extras', () => {
    const type = (id: string) => {
      const r = parseRulesFile(`${id}.md`, read(`plumbing/${id}.md`));
      if (!r.ok) throw new Error(r.error);
      return r.type;
    };
    expect(type('phases').timeline).toBe(true);
    expect(type('questions').fields).toEqual(['blocking', 'default']);
    expect(type('concerns').answerPresets).toEqual(["Accept Claude's fix", 'Accept the risk']);
    expect(type('ideas').answerPresets).toEqual(['Add to scope', 'Park for later', 'Drop']);
  });

  it('labels the add button on Questions, Concerns and Ideas', () => {
    const type = (id: string) => {
      const r = parseRulesFile(`${id}.md`, read(`plumbing/${id}.md`));
      if (!r.ok) throw new Error(r.error);
      return r.type;
    };
    expect([type('questions').addLabel, type('concerns').addLabel, type('ideas').addLabel]).toEqual(['Question', 'Concern', 'Idea']);
    expect(type('phases').addLabel).toBeUndefined();
  });

  it('ships both output rules files', () => {
    expect(read('outputs/finalize.md')).toMatch(/Notes for the implementer/);
    expect(read('outputs/whiteboard-defense.md')).toMatch(/If you ship it, you should be able to explain it/);
  });
});
