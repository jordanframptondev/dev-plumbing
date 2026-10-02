import { describe, expect, it } from 'vitest';
import { changeSchema, changeState, importItemSchema, messageSchema, optionSchema, replySchema } from './loop';
import { plumbingProjectSchema, threadSchema } from './project';

describe('loop schemas', () => {
  it('reads every kind of message, including the plain ones Plan 1 wrote', () => {
    expect(messageSchema.parse({ id: 'a', at: 'now', author: 'claude', text: 'Hi' })).toMatchObject({ author: 'claude' });
    expect(messageSchema.parse({ id: 'b', at: 'now', author: 'you', text: 'Both.' })).toMatchObject({ author: 'you' });
    expect(messageSchema.parse({ id: 'c', at: 'now', author: 'you', optionId: 'yes', optionLabel: 'Yes', note: 'n' })).toMatchObject({ optionLabel: 'Yes' });
    expect(messageSchema.safeParse({ id: 'd', at: 'now', author: 'claude' }).success).toBe(false);
    expect(threadSchema.parse({ id: 't', itemId: 'i', status: 'idle', messages: [{ id: 's', at: 'now', author: 'system', text: 'Parked.' }] }).messages[0]?.author).toBe('system');
  });

  it('keeps option ids safe and changes strict', () => {
    expect(optionSchema.safeParse({ id: 'keep-365', label: 'Keep 365 days' }).success).toBe(true);
    expect(optionSchema.safeParse({ id: '../x', label: 'Bad' }).success).toBe(false);
    expect(changeSchema.safeParse({ md: [{ find: 'a', replace: 'b' }], other: 1 }).success).toBe(false);
    expect(changeSchema.safeParse({ items: [{ itemId: 'i', patch: { owner: 'me' } }] }).success).toBe(false);
  });

  it('describes what subagents send', () => {
    expect(importItemSchema.safeParse({ key: 'who-gets-reminders', title: 'Who gets reminders?', summary: 'Everyone or some?' }).success).toBe(true);
    expect(importItemSchema.safeParse({ key: 'Bad Key', title: 'x', summary: 'y' }).success).toBe(false);
    expect(replySchema.safeParse({ threadId: 't', text: 'Done.', resolve: { decision: 'Both channels' } }).success).toBe(true);
    expect(replySchema.safeParse({ threadId: 't', text: '' }).success).toBe(false);
  });

  it('gives Plan 1 projects an empty import queue', () => {
    const p = plumbingProjectSchema.parse({
      id: 'x', repo: 'acme', title: 'X', status: 'active',
      source: { path: 'a.md', clone: '~/acme', branch: 'main', hashAtImport: 'h' },
      docs: { original: 'docs/original.md', draft: 'docs/draft.md' },
      createdAt: 'now', updatedAt: 'now',
    });
    expect(p.importPending).toEqual([]);
  });

  it('tells applied, pending and undone changes apart', () => {
    const base = { id: 'c', at: 'now', threadId: 't', kind: 'small-edit' as const, summary: 's', change: {}, itemsBefore: {}, itemsAfter: {} };
    expect(changeState(base)).toBe('pending');
    expect(changeState({ ...base, appliedAt: 'now' })).toBe('applied');
    expect(changeState({ ...base, appliedAt: 'now', undoneAt: 'later' })).toBe('undone');
  });
});
