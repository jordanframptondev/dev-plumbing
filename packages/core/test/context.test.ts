import { afterAll, describe, expect, it } from 'vitest';
import { dataShapeDoc, repoProfileSchema } from '../src/schemas';
import { importPack, threadPack } from '../src/store/context';
import { addDecision } from '../src/store/decisions';
import { readItem, writeItem } from '../src/store/io';
import { removeTempDirs } from '../../../testkit/tmp';
import { listType, pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const profile = repoProfileSchema.parse({ name: 'acme', match: ['github.com/acme/acme'], conventions: ['Ids use uuid()'], apps: [{ name: 'web', path: 'apps/web', kitFiles: ['apps/web/theme.css'] }] });

describe('context packs', () => {
  it('gives a thread subagent what it needs, and nothing more', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { links: ['c1'] }), pair('c1', { type: 'concerns', title: 'Burst of sends' }), pair('q9', { links: ['q1'], title: 'Linked back' }), pair('q7')] });
    await writeItem(dir, { ...(await readItem(dir, 'q1')), mdAnchor: { heading: 'Data' } });
    await addDecision(dir, { text: 'Reminders go by SMS and email', threadId: 't-q7', itemIds: ['q7'] });
    const pack = await threadPack({ dir, threadId: 't-q1', types: TYPES, profile });
    expect(pack.project).toEqual({ repo: 'acme', id: 'restock', title: 'Restock reminders', summary: 'Remind customers before a subscription item runs out.' });
    expect(pack.type).toEqual({ id: 'questions', title: 'Questions', screen: 'list', timeline: false, dataShape: null, rules: '- Be brief.', fields: ['blocking', 'default'], answerPresets: [] });
    expect(pack.anchored).toBeNull();
    expect(pack.item.id).toBe('q1');
    expect(pack.thread.messages).toHaveLength(1);
    expect(pack.linked.map((l) => l.id).sort()).toEqual(['c1', 'q9']);
    expect(pack.decisions).toEqual(['Reminders go by SMS and email']);
    expect(pack.draftSection).toEqual({ heading: 'Data', text: '## Data\n\nLog reminders in a table.' });
    expect(pack.draftHeadings).toEqual(['# Restock reminders', '## Approach', '## Data']);
    expect(pack.draftFile).toMatch(/docs\/draft\.md$/);
    expect(pack.conventions).toEqual(['Ids use uuid()']);
  });

  it('gives an importer the whole draft, its rules file and the repo profile', async () => {
    const dir = await seedProject({ pairs: [pair('q1')] });
    const pack = await importPack({ dir, typeId: 'questions', types: TYPES, profile });
    expect(pack.type).toMatchObject({ id: 'questions', screen: 'list', fields: ['blocking', 'default'], rules: '## Rules\n- Be brief.\n' });
    expect(pack.draft).toMatch(/^# Restock reminders/);
    expect(pack.profile).toEqual({ name: 'acme', conventions: ['Ids use uuid()'], apps: [{ name: 'web', path: 'apps/web', kitFiles: ['apps/web/theme.css'] }], planFolders: [] });
    expect(pack.existingItems).toEqual([{ id: 'q1', type: 'questions', title: 'Question q1' }]);
    await expect(importPack({ dir, typeId: 'nope', types: TYPES })).rejects.toThrow(/no plumbing type "nope"/);
  });

  it('gives a pin thread the whole item it is anchored to, data included', async () => {
    const diagram = { kind: 'system', groups: [], nodes: [{ id: 'job', label: 'Reminder job', status: 'new' }], edges: [] };
    const dir = await seedProject({
      pairs: [
        pair('a1', { type: 'architecture', title: 'System view' }),
        pair('a2', { type: 'architecture', title: 'About Reminder job', links: ['a1'] }),
        pair('a3', { type: 'architecture', title: 'About a deleted view' }),
      ],
    });
    await writeItem(dir, { ...(await readItem(dir, 'a1')), data: diagram });
    await writeItem(dir, { ...(await readItem(dir, 'a2')), anchor: { itemId: 'a1', kind: 'node', ref: 'job', label: 'Reminder job' } });
    await writeItem(dir, { ...(await readItem(dir, 'a3')), anchor: { itemId: 'gone', kind: 'node', ref: 'job', label: 'Reminder job' } });
    const pack = await threadPack({ dir, threadId: 't-a2', types: TYPES, profile });
    expect(pack.item.anchor).toEqual({ itemId: 'a1', kind: 'node', ref: 'job', label: 'Reminder job' });
    expect(pack.anchored).toMatchObject({ id: 'a1', type: 'architecture', title: 'System view', data: diagram });
    // A missing anchored item and an item with no anchor both give null, never an error.
    expect((await threadPack({ dir, threadId: 't-a3', types: TYPES })).anchored).toBeNull();
    expect((await threadPack({ dir, threadId: 't-a1', types: TYPES })).anchored).toBeNull();
  });

  it('tells subagents how their items write data', async () => {
    const types = [...TYPES, listType('phases', { title: 'Phases & milestones', order: 8, timeline: true })];
    const dir = await seedProject({ pairs: [pair('a1', { type: 'architecture', title: 'System view' }), pair('q1')] });
    expect((await importPack({ dir, typeId: 'architecture', types, profile })).type).toMatchObject({ screen: 'diagram', timeline: false, dataShape: dataShapeDoc('diagram') });
    expect((await importPack({ dir, typeId: 'phases', types })).type).toMatchObject({ screen: 'list', timeline: true, dataShape: dataShapeDoc('timeline') });
    expect((await importPack({ dir, typeId: 'questions', types })).type.dataShape).toBeNull();
    const pack = await threadPack({ dir, threadId: 't-a1', types, profile });
    expect(pack.type).toMatchObject({ id: 'architecture', screen: 'diagram', timeline: false, dataShape: dataShapeDoc('diagram') });
  });
});
