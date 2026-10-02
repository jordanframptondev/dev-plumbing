import { afterAll, describe, expect, it } from 'vitest';
import { repoProfileSchema } from '../src/schemas';
import { importPack, threadPack } from '../src/store/context';
import { addDecision } from '../src/store/decisions';
import { readItem, writeItem } from '../src/store/io';
import { removeTempDirs } from '../../../testkit/tmp';
import { pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const profile = repoProfileSchema.parse({ name: 'acme', match: ['github.com/acme/acme'], conventions: ['Ids use uuid()'], apps: [{ name: 'web', path: 'apps/web', kitFiles: ['apps/web/theme.css'] }] });

describe('context packs', () => {
  it('gives a thread subagent what it needs, and nothing more', async () => {
    const dir = await seedProject({ pairs: [pair('q1', { links: ['c1'] }), pair('c1', { type: 'concerns', title: 'Burst of sends' }), pair('q9', { links: ['q1'], title: 'Linked back' }), pair('q7')] });
    await writeItem(dir, { ...(await readItem(dir, 'q1')), mdAnchor: { heading: 'Data' } });
    await addDecision(dir, { text: 'Reminders go by SMS and email', threadId: 't-q7', itemIds: ['q7'] });
    const pack = await threadPack({ dir, threadId: 't-q1', types: TYPES, profile });
    expect(pack.project).toEqual({ repo: 'acme', id: 'restock', title: 'Restock reminders', summary: 'Remind customers before a subscription item runs out.' });
    expect(pack.type).toEqual({ id: 'questions', title: 'Questions', rules: '- Be brief.', fields: ['blocking', 'default'], answerPresets: [] });
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
    expect(pack.profile).toEqual({ name: 'acme', conventions: ['Ids use uuid()'], apps: [{ name: 'web', path: 'apps/web' }], planFolders: [] });
    expect(pack.existingItems).toEqual([{ id: 'q1', type: 'questions', title: 'Question q1' }]);
    await expect(importPack({ dir, typeId: 'nope', types: TYPES })).rejects.toThrow(/no plumbing type "nope"/);
  });
});
