import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFENSE_CHANGE_REFUSAL, DEFENSE_NEW_ITEMS_REFUSAL, DEFENSE_RESOLVE_REFUSAL, DEFENSE_TYPE } from '../src/defenseType';
import { importableTypes } from '../src/planChanges';
import type { FinalizeChecklist, Item, Message, Option, ReplyInput, Thread } from '../src/schemas';
import { finalizeChecklist } from '../src/store/checklist';
import { finalizePack, importPack, threadPack } from '../src/store/context';
import { addDecision, relevantDecisions } from '../src/store/decisions';
import { finalInputsHash } from '../src/store/finalize';
import { readDecisions, readHistory, readItem, readItems, readThread, writeItem, writeThread } from '../src/store/io';
import { loadProjectHome } from '../src/store/projects';
import { postReply } from '../src/store/reply';
import { updateRefusal } from '../src/store/update';
import { removeTempDirs } from '../../../testkit/tmp';
import { DRAFT, pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const AT = '2026-10-06T09:00:00.000Z';
const types = [...TYPES, DEFENSE_TYPE];
const RULES = '# Finalize spec rules\n';
const QUESTION = 'Does the unsubscribe link need a signed token?';
const ID = 'defense-does-the-unsubscribe-link-need-a-signed-token';

const you: Message = { id: 'y-1', at: AT, author: 'you', text: QUESTION, sentWith: 'thread' };
const answer: Message = { id: 'm-1', at: AT, author: 'claude', text: "The plan doesn't say. Without one, anyone with the link could unsubscribe someone else." };
const PROPOSAL: Option[] = [
  { id: 'say-so', label: 'Say so in the plan', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log reminders in a table. Sign the unsubscribe link.' }] } },
  { id: 'enough', label: 'That answers it' },
];
const proposal: Message = { id: 'm-2', at: AT, author: 'claude', text: 'Shall I add it to the plan?', options: PROPOSAL, recommended: 'say-so' };

/** A Defense thread in each state that would put an ordinary item on the Finalize checklist. */
const STATES: Record<string, { status: Thread['status']; messages: Message[] }> = {
  'with Claude': { status: 'with_claude', messages: [you] },
  'holding a proposal with a change': { status: 'your_turn', messages: [you, answer, proposal] },
  parked: { status: 'parked', messages: [you, answer] },
  'with no message from you': { status: 'your_turn', messages: [answer] },
};

/** A Defense item, as Ask Claude about this makes it, and its thread. */
function asked(thread: { status: Thread['status']; messages: Message[] }): { item: Item; thread: Thread } {
  const p = pair(ID, { type: 'defense', title: QUESTION, status: thread.status, messages: thread.messages });
  return { item: { ...p.item, createdBy: 'whiteboard', fromDefense: { id: 'w-test', kind: 'section', ref: 'security' } }, thread: p.thread };
}

/** Every item the checklist lists, on any of its lists. */
const listed = (c: FinalizeChecklist) => [...c.blocking, ...c.defaults, ...c.parked, ...c.unreviewed].map((e) => e.itemId);
const draftOf = (dir: string) => fs.readFile(path.join(dir, 'docs', 'draft.md'), 'utf8');
/** The error a promise rejects with, as its class name and message, or null if it resolves. */
const refusal = (p: Promise<unknown>) => p.then(() => null, (e: Error) => ({ type: e.constructor.name, message: e.message }));

describe('the built-in Defense type', () => {
  it('a Defense thread never touches Finalize', async () => {
    for (const [state, thread] of Object.entries(STATES)) {
      const dir = await seedProject({ pairs: [pair('q1', { title: 'Who gets reminders?', status: 'resolved' })] });
      await addDecision(dir, { text: 'Everyone with an active subscription.', threadId: 't-q1', itemIds: ['q1'] });
      const before = await finalInputsHash(dir);
      const defense = asked(thread);
      await writeItem(dir, defense.item);
      await writeThread(dir, defense.thread);
      await addDecision(dir, { text: 'The unsubscribe link carries a signed token.', threadId: defense.thread.id, itemIds: [defense.item.id] });

      const checklist = await finalizeChecklist(dir, types);
      expect(listed(checklist), state).toEqual([]);
      expect(checklist.canStart, state).toBe(true);
      const pack = await finalizePack({ dir, types, rules: RULES });
      expect(pack.items.map((i) => i.id), state).toEqual(['q1']);
      expect(pack.decisions.map((d) => d.text), state).toEqual(['Everyone with an active subscription.']);
      expect(pack.openItems, state).toEqual([]);
      expect(await finalInputsHash(dir), state).toBe(before);
      // A plan thread's own pack never has the Defense thread's decision.
      expect((await threadPack({ dir, threadId: 't-q1', types })).decisions, state).toEqual(['Everyone with an active subscription.']);
    }

    // Its decisions stay with the defense, even for an item Claude added from the Defense thread, which links to it:
    // neither that item's pack nor the main window's cross-check of a submission gets them. Its own pack has them all.
    const fromIt = pair('questions-sign-the-link', { title: 'Sign the unsubscribe link?', links: [ID] });
    const linked = await seedProject({ pairs: [pair('q1', { title: 'Who gets reminders?', status: 'resolved' }), asked(STATES['with Claude']), fromIt] });
    await addDecision(linked, { text: 'Everyone with an active subscription.', threadId: 't-q1', itemIds: ['q1'] });
    await addDecision(linked, { text: 'The unsubscribe link carries a signed token.', threadId: `t-${ID}`, itemIds: [ID] });
    expect((await threadPack({ dir: linked, threadId: fromIt.thread.id, types })).decisions).toEqual(['Everyone with an active subscription.']);
    expect(await relevantDecisions(linked, [fromIt.thread.id])).toEqual({ decisions: [], total: 2 });
    expect((await threadPack({ dir: linked, threadId: `t-${ID}`, types })).decisions).toEqual(['Everyone with an active subscription.', 'The unsubscribe link carries a signed token.']);
    expect((await relevantDecisions(linked, [`t-${ID}`])).decisions).toEqual(['The unsubscribe link carries a signed token.']);

    // Nor can a reply on one change the draft: a change in an option, or a small edit, is refused and nothing is written.
    const seeded = asked(STATES['with Claude']);
    const dir = await seedProject({ pairs: [seeded, pair('q1', { title: 'Who gets reminders?' })] });
    const reply = (r: Partial<ReplyInput>) =>
      postReply(dir, { reply: { threadId: seeded.thread.id, text: 'A signed token stops anyone unsubscribing someone else.', ...r }, types, autoApply: true, clone: '/nowhere' });
    const refusedFor = (problem: string) => ({ type: 'InputError', message: `Nothing was saved. Fix these and call dp_reply again:\n- ${problem}` });
    const refused = refusedFor(DEFENSE_CHANGE_REFUSAL);
    const smallEdits = [{ summary: 'Sign the link', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log reminders in a table. Sign the unsubscribe link.' }] } }];
    expect(await refusal(reply({ options: PROPOSAL, recommended: 'say-so' }))).toEqual(refused);
    expect(await refusal(reply({ smallEdits }))).toEqual(refused);
    // Both at once are one problem.
    expect(await refusal(reply({ options: PROPOSAL, smallEdits }))).toEqual(refused);
    // Its decision can't settle a plan item either.
    expect(await refusal(reply({ resolve: { decision: 'The link is signed.', itemIds: [ID, 'q1'] } }))).toEqual(refusedFor(DEFENSE_RESOLVE_REFUSAL));
    expect(await readThread(dir, seeded.thread.id)).toEqual(seeded.thread);
    expect(await draftOf(dir)).toBe(DRAFT);
    expect(await readHistory(dir)).toEqual([]);
    expect(await readDecisions(dir)).toEqual([]);
  });

  it('takes plain options and a new Questions item on a Defense thread, and no other type of item', async () => {
    const seeded = asked(STATES['with Claude']);
    const dir = await seedProject({ pairs: [seeded] });
    const architecture = postReply(dir, {
      reply: {
        threadId: seeded.thread.id,
        text: 'A signing service would settle it.',
        newItems: [{ type: 'architecture', title: 'Signing service', summary: 'Signs unsubscribe links.', message: { text: 'Add a signing service?' } }],
      },
      types,
      autoApply: true,
      clone: '/nowhere',
    });
    expect(await refusal(architecture)).toEqual({ type: 'InputError', message: `Nothing was saved. Fix these and call dp_reply again:\n- ${DEFENSE_NEW_ITEMS_REFUSAL}` });
    expect((await readItems(dir)).values.map((i) => i.id)).toEqual([ID]);
    const r = await postReply(dir, {
      reply: {
        threadId: seeded.thread.id,
        text: "The plan doesn't say, so I've asked it in Questions.",
        options: [
          { id: 'enough', label: 'That answers it' },
          { id: 'more', label: 'Say more about tokens' },
        ],
        newItems: [{ type: 'questions', title: 'Sign the unsubscribe link?', summary: 'Whether the link carries a signed token.', message: { text: 'Should the unsubscribe link carry a signed token?' } }],
      },
      types,
      autoApply: true,
      clone: '/nowhere',
    });
    expect(r.newThreadIds).toEqual(['t-questions-sign-the-unsubscribe-link']);
    expect((await readThread(dir, seeded.thread.id)).status).toBe('your_turn');
    expect(await readItem(dir, 'questions-sign-the-unsubscribe-link')).toMatchObject({ type: 'questions', createdBy: 'claude', links: [ID] });
    expect(await draftOf(dir)).toBe(DRAFT);
  });

  it('resolves its own answer when the person needs nothing more, keeping the answer in the thread', async () => {
    const seeded = asked(STATES['with Claude']);
    const dir = await seedProject({ pairs: [seeded] });
    const text = "The plan doesn't sign it, so anyone with the link could unsubscribe someone else.";
    await postReply(dir, { reply: { threadId: seeded.thread.id, text, resolve: { decision: "The unsubscribe link isn't signed yet." } }, types, autoApply: true, clone: '/nowhere' });
    const thread = await readThread(dir, seeded.thread.id);
    // Off the Inbox, with Claude's answer still there to read. Replying reopens it, as on any resolved thread.
    expect(thread.status).toBe('resolved');
    expect(thread.messages.at(-1)).toMatchObject({ author: 'claude', text, resolved: true });
    expect((await readDecisions(dir)).map((d) => [d.text, d.itemIds])).toEqual([["The unsubscribe link isn't signed yet.", [ID]]]);
  });

  it("doesn't hold up a plan update while Claude answers a Defense thread", async () => {
    const dir = await seedProject({ pairs: [asked(STATES['with Claude'])] });
    expect(await updateRefusal(dir)).toBeNull();
    const q1 = pair('q1', { status: 'with_claude', messages: [{ ...you, text: 'Who gets reminders?' }] });
    await writeItem(dir, q1.item);
    await writeThread(dir, q1.thread);
    expect(await updateRefusal(dir)).toBe("Claude has 1 thread to answer in this project first. Run /dev-plumbing again once it's answered.");
  });

  it("is never imported, and Claude can't add one in a reply", async () => {
    expect(importableTypes(types).map((t) => t.id)).toEqual(['architecture', 'questions', 'concerns']);
    const q1 = pair('q1', { status: 'with_claude', messages: [{ ...you, text: 'Who gets reminders?' }] });
    const dir = await seedProject({ pairs: [q1] });
    const attempt = postReply(dir, {
      reply: { threadId: 't-q1', text: 'Everyone active.', newItems: [{ type: 'defense', title: 'Is the link signed?', summary: 'A summary.', message: { text: 'Is it?' } }] },
      types,
      autoApply: true,
      clone: '/nowhere',
    });
    expect(await refusal(attempt)).toEqual({
      type: 'InputError',
      message: 'Nothing was saved. Fix these and call dp_reply again:\n- New item 1 (Is the link signed?): "defense" isn\'t an enabled plumbing type. Use one of: architecture, questions, concerns.',
    });
    expect((await readItems(dir)).values.map((i) => i.id)).toEqual(['q1']);
  });

  it("leaves Defense items out of an importer's existing items", async () => {
    const dir = await seedProject({ pairs: [pair('q1'), asked(STATES['with Claude'])] });
    expect((await importPack({ dir, typeId: 'questions', types })).existingItems).toEqual([{ id: 'q1', type: 'questions', title: 'Question q1' }]);
  });

  it('shows Defense in the navigation only once the project has a Defense item, after every other type', async () => {
    const dir = await seedProject({ pairs: [pair('q1')] });
    const restock = { repo: 'acme', id: 'restock', dir };
    expect((await loadProjectHome(restock, types)).types.map((t) => t.id)).toEqual(['architecture', 'questions', 'concerns']);
    const defense = asked(STATES['with Claude']);
    await writeItem(dir, defense.item);
    await writeThread(dir, defense.thread);
    const home = await loadProjectHome(restock, types);
    expect(home.types.map((t) => t.id)).toEqual(['architecture', 'questions', 'concerns', 'defense']);
    expect(home.types.at(-1)).toMatchObject({ title: 'Defense questions', itemCount: 1, withClaude: 1, emptyMessage: 'Nothing asked about the Whiteboard Defense yet.' });
    expect(home.inbox.find((e) => e.itemId === ID)?.typeTitle).toBe('Defense questions');
    // It never holds up Finalize, though its thread is with Claude.
    expect(home.finalize).toMatchObject({ canStart: true, blockingCount: 0 });
  });
});
