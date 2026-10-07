import { afterAll, describe, expect, it } from 'vitest';
import { DEFENSE_TYPE } from '../src/defenseType';
import type { Message, Option, PlumbingType, WhiteboardDefense } from '../src/schemas';
import { finalizeChecklist } from '../src/store/checklist';
import { askAboutDefense, defenseLinks, sendFromDefense } from '../src/store/defenseItems';
import { defensePartMarkdown } from '../src/store/defenseMarkdown';
import { ConflictError, InputError, readItem, readItems, readThread, writeItem, writeThread } from '../src/store/io';
import { pendingSubmissions } from '../src/store/queue';
import { submit } from '../src/store/submit';
import { writeDefense } from '../src/store/whiteboard';
import { removeTempDirs } from '../../../testkit/tmp';
import { pair, seedProject, storedDefense, TYPES } from './fixtures';

afterAll(removeTempDirs);

const types: PlumbingType[] = [...TYPES, DEFENSE_TYPE];
const T1 = new Date('2026-10-06T10:00:00.000Z');
const T2 = new Date('2026-10-06T11:00:00.000Z');
const T3 = new Date('2026-10-06T12:00:00.000Z');
const WHO = 'Who can turn reminders off for a customer?';
const RERUN = 'A rerun on the same day sends duplicate emails.';

/** The fixture's defense, with a known, an unknown and a verify claim in Security model, and a high and an info concern. */
function defense(): WhiteboardDefense {
  const base = storedDefense();
  return storedDefense({
    sections: base.sections.map((s) =>
      s.id === 'security'
        ? {
            ...s,
            claims: [
              { text: 'Only the reminder job reads the reminders table.', basis: 'known' },
              { text: WHO, basis: 'unknown' },
              { text: 'The email provider accepts a burst of 10,000 sends.', basis: 'verify' },
            ],
          }
        : s,
    ),
    concerns: [
      { id: 'c1', severity: 'high', text: RERUN, basis: 'inferred' },
      { id: 'c2', severity: 'info', text: 'Some reminders may land in spam.', basis: 'inferred' },
    ],
  });
}

async function seed(): Promise<string> {
  const dir = await seedProject({ pairs: [pair('q-lead', { title: 'Lead time', status: 'resolved' })] });
  await writeDefense(dir, defense());
  return dir;
}

const failure = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e);
/** Refused with exactly this error, and nothing written. */
async function refused(dir: string, run: () => Promise<unknown>, kind: typeof InputError | typeof ConflictError, message: string): Promise<void> {
  const before = (await readItems(dir)).values.length;
  const error = await failure(run());
  expect(error, message).toBeInstanceOf(kind);
  expect((error as Error).message).toBe(message);
  expect((await readItems(dir)).values.length, message).toBe(before);
}

describe('asking Claude about the Whiteboard Defense', () => {
  it('makes a Defense item about the part, with your question waiting to be sent', async () => {
    const dir = await seed();
    const first = `How does the job know a customer was already reminded today? ${'It matters for reruns. '.repeat(6)}`.trim();
    const question = `${first}\n\nAnd what about time zones?`;
    const { itemId, threadId } = await askAboutDefense(dir, { defenseId: 'w-test', kind: 'section', ref: 'security', question: `  ${question}\n`, now: T1 });
    expect(itemId).toMatch(/^defense-how-does-the-job-know-a-customer/);
    expect(threadId).toBe(`t-${itemId}`);
    // The title is the question's first line, cut to 120 characters.
    expect(await readItem(dir, itemId)).toEqual({
      id: itemId,
      type: 'defense',
      title: `${first.slice(0, 119)}…`,
      summary: 'About 5. Security model',
      body: defensePartMarkdown(defense(), 'section', 'security'),
      threadId,
      createdBy: 'whiteboard',
      fromDefense: { id: 'w-test', kind: 'section', ref: 'security' },
    });
    expect(await readThread(dir, threadId)).toEqual({ id: threadId, itemId, status: 'idle', draft: { text: question, updatedAt: T1.toISOString() }, messages: [] });

    // Sent like Send this thread: your question is the first message, and Claude has it.
    const result = await submit(dir, { scope: 'thread', threadId, types, now: T2 });
    expect(result.sent).toEqual([threadId]);
    const sent = await readThread(dir, threadId);
    expect(sent.status).toBe('with_claude');
    expect(sent.draft).toBeUndefined();
    expect(sent.messages).toEqual([{ id: expect.any(String), at: T2.toISOString(), author: 'you', sentWith: 'thread', text: question }]);
  });

  it('says what a question or a concern asked about is, and makes a new thread each time', async () => {
    const dir = await seed();
    const d = defense();
    const q = await askAboutDefense(dir, { defenseId: 'w-test', kind: 'question', ref: 'q1', question: 'Why not a queue?', now: T1 });
    const again = await askAboutDefense(dir, { defenseId: 'w-test', kind: 'question', ref: 'q1', question: 'Why not a queue?', now: T2 });
    const c = await askAboutDefense(dir, { defenseId: 'w-test', kind: 'concern', ref: 'c1', question: 'How likely is this?', now: T1 });
    expect([q.itemId, again.itemId]).toEqual(['defense-why-not-a-queue', 'defense-why-not-a-queue-2']);
    expect(await readItem(dir, q.itemId)).toMatchObject({ summary: `About the question: ${d.questions[0].q}`, body: defensePartMarkdown(d, 'question', 'q1') });
    expect(await readItem(dir, c.itemId)).toMatchObject({ summary: `About the high concern: ${RERUN}`, body: defensePartMarkdown(d, 'concern', 'c1') });

    // A summary is cut to 300 characters.
    const long = 'Why does the reminder job need to know about every subscription the customer has ever had? '.repeat(5).trim();
    await writeDefense(dir, { ...d, questions: [{ id: 'q1', q: long, a: 'It only reads the active ones.', basis: 'known' }] });
    const clipped = await askAboutDefense(dir, { defenseId: 'w-test', kind: 'question', ref: 'q1', question: 'Really?', now: T3 });
    expect((await readItem(dir, clipped.itemId)).summary).toBe(`${`About the question: ${long}`.slice(0, 299)}…`);
  });

  it("refuses with no defense, a defense that changed since the page loaded, or a part it doesn't have", async () => {
    const empty = await seedProject();
    await refused(empty, () => askAboutDefense(empty, { defenseId: 'w-test', kind: 'section', ref: 'security', question: 'Why?' }), ConflictError, "There's no Whiteboard Defense yet.");
    const dir = await seed();
    await refused(
      dir,
      () => askAboutDefense(dir, { defenseId: 'w-older', kind: 'section', ref: 'security', question: 'Why?' }),
      ConflictError,
      'The Whiteboard Defense changed since this page loaded. Reload it.',
    );
    for (const [kind, ref] of [['section', 'nope'], ['question', 'q9'], ['concern', 'c9']] as const) {
      await refused(dir, () => askAboutDefense(dir, { defenseId: 'w-test', kind, ref, question: 'Why?' }), InputError, "That part of the Whiteboard Defense doesn't exist.");
    }
    await refused(dir, () => askAboutDefense(dir, { defenseId: 'w-test', kind: 'section', ref: 'security', question: ' \n ' }), InputError, 'Write your message first.');
  });
});

describe('sending the Whiteboard Defense to plumbing', () => {
  it('sends an unknown claim to Questions, where Claude starts the thread', async () => {
    const dir = await seed();
    const result = await sendFromDefense(dir, { defenseId: 'w-test', kind: 'claim', ref: 'security.1', types, now: T1 });
    const itemId = 'questions-who-can-turn-reminders-off-for-a-customer';
    expect(result).toEqual({ itemId, threadId: `t-${itemId}`, typeId: 'questions', typeTitle: 'Questions' });
    expect(await readItem(dir, itemId)).toEqual({
      id: itemId,
      type: 'questions',
      title: WHO,
      summary: WHO,
      body: `From the Whiteboard Defense (5. Security model), marked Unknown:\n\n${WHO}`,
      threadId: `t-${itemId}`,
      createdBy: 'whiteboard',
      fromDefense: { id: 'w-test', kind: 'claim', ref: 'security.1', text: WHO },
    });
    expect(await readThread(dir, `t-${itemId}`)).toEqual({
      id: `t-${itemId}`,
      itemId,
      status: 'with_claude',
      messages: [{ id: expect.any(String), at: T1.toISOString(), author: 'system', text: 'Sent from the Whiteboard Defense.' }],
    });
    // The next dp_wait hands this thread to a window, as it does a Plan changes thread.
    expect(await pendingSubmissions(dir)).toEqual([
      { id: expect.stringMatching(/^s-/), at: T1.toISOString(), scope: 'all', drafts: {}, sent: [`t-${itemId}`], resolved: [], processedAt: T1.toISOString() },
    ]);

    const verify = await sendFromDefense(dir, { defenseId: 'w-test', kind: 'claim', ref: 'security.2', types, now: T2 });
    expect((await readItem(dir, verify.itemId)).body).toBe('From the Whiteboard Defense (5. Security model), marked Verify before release:\n\nThe email provider accepts a burst of 10,000 sends.');
  });

  it('sends a high concern to Concerns, where it blocks Finalize like any other, and an informational one as low', async () => {
    const dir = await seed();
    const high = await sendFromDefense(dir, { defenseId: 'w-test', kind: 'concern', ref: 'c1', types, now: T1 });
    expect(high.typeTitle).toBe('Concerns');
    expect(await readItem(dir, high.itemId)).toMatchObject({
      type: 'concerns',
      title: RERUN,
      fields: { severity: 'high' },
      body: `From the Whiteboard Defense's release concerns, marked High:\n\n${RERUN}`,
    });
    const info = await sendFromDefense(dir, { defenseId: 'w-test', kind: 'concern', ref: 'c2', types, now: T1 });
    expect((await readItem(dir, info.itemId)).fields).toEqual({ severity: 'low' });

    // Claude has replied in both: the high one still blocks until it's resolved, and the low one doesn't.
    for (const id of [high.threadId, info.threadId]) {
      const thread = await readThread(dir, id);
      await writeThread(dir, { ...thread, status: 'your_turn', messages: [...thread.messages, { id: `m-${id}`, at: T2.toISOString(), author: 'claude', text: 'Here is a fix.' }] });
    }
    const checklist = await finalizeChecklist(dir, types);
    expect(checklist.blocking).toEqual([{ itemId: high.itemId, threadId: high.threadId, title: RERUN, typeTitle: 'Concerns', reason: 'High-severity concern, not resolved.' }]);
    expect(checklist.canStart).toBe(false);
  });

  it("doesn't hold up Finalize with Claude's suggested answers until you've written in the thread", async () => {
    const dir = await seed();
    const { itemId, threadId } = await sendFromDefense(dir, { defenseId: 'w-test', kind: 'claim', ref: 'security.1', types, now: T1 });
    const sent = await readThread(dir, threadId);
    const PROPOSAL: Option[] = [
      { id: 'admins', label: 'Only admins', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log reminders in a table. Only admins turn them off.' }] } },
      { id: 'anyone', label: 'The customer too' },
    ];
    const suggested: Message = { id: 'm-1', at: T2.toISOString(), author: 'claude', text: 'Two ways to settle it.', options: PROPOSAL, recommended: 'admins' };
    await writeThread(dir, { ...sent, status: 'your_turn', messages: [...sent.messages, suggested] });
    const first = await finalizeChecklist(dir, types);
    expect(first.blocking).toEqual([]);
    expect(first.unreviewed).toEqual([{ itemId, threadId, title: WHO, typeTitle: 'Questions', reason: 'Nobody has answered here.' }]);

    // Once you've written in it, Claude's next proposal waits for your answer.
    const you: Message = { id: 'y-1', at: T3.toISOString(), author: 'you', optionId: 'custom', text: 'Only admins, but who are they?' };
    const proposal: Message = { ...suggested, id: 'm-2', at: T3.toISOString(), text: 'The account owner and support.' };
    await writeThread(dir, { ...sent, status: 'your_turn', messages: [...sent.messages, suggested, you, proposal] });
    expect((await finalizeChecklist(dir, types)).blocking).toEqual([{ itemId, threadId, title: WHO, typeTitle: 'Questions', reason: 'A proposal is waiting for your answer.' }]);
  });

  it('knows a part was sent from an earlier defense by its text, so a regenerate never sends it twice', async () => {
    const dir = await seed();
    const claim = await sendFromDefense(dir, { defenseId: 'w-test', kind: 'claim', ref: 'security.1', types, now: T1 });
    const concern = await sendFromDefense(dir, { defenseId: 'w-test', kind: 'concern', ref: 'c1', types, now: T2 });
    // Regenerated: the same unknown, spaced differently, is now Unknowns' second claim, and the same concern is c2.
    const d = defense();
    const regenerated: WhiteboardDefense = {
      ...d,
      id: 'w-again',
      sections: d.sections.map((s) =>
        s.id === 'security' ? { ...s, claims: [s.claims[0]] } : s.id === 'unknowns' ? { ...s, claims: [...s.claims, { text: ` ${WHO.replace(/ /g, '  ')} `, basis: 'unknown' as const }] } : s,
      ),
      concerns: [{ id: 'c1', severity: 'low', text: 'Logs grow without a limit.', basis: 'inferred' }, { ...d.concerns[0], id: 'c2' }],
    };
    await writeDefense(dir, regenerated);
    await refused(dir, () => sendFromDefense(dir, { defenseId: 'w-again', kind: 'claim', ref: 'unknowns.1', types }), ConflictError, "That's already in Questions.");
    await refused(dir, () => sendFromDefense(dir, { defenseId: 'w-again', kind: 'concern', ref: 'c2', types }), ConflictError, "That's already in Concerns.");
    // The page shows them as sent, against this defense's parts.
    expect((await defenseLinks(dir, regenerated)).sent).toEqual([
      { kind: 'claim', ref: 'unknowns.1', itemId: claim.itemId, threadId: claim.threadId, typeId: 'questions', title: WHO, status: 'with_claude' },
      { kind: 'concern', ref: 'c2', itemId: concern.itemId, threadId: concern.threadId, typeId: 'concerns', title: RERUN, status: 'with_claude' },
    ]);
    // A part with new text still goes.
    expect((await sendFromDefense(dir, { defenseId: 'w-again', kind: 'concern', ref: 'c1', types, now: T3 })).typeTitle).toBe('Concerns');
  });

  it('shows a sent part as sent at every part of the defense with the same text, so Send is never offered and then refused', async () => {
    const dir = await seed();
    // The same unknown in Security model and, spaced differently, in Unknowns; the same concern twice.
    const d = defense();
    const repeated: WhiteboardDefense = {
      ...d,
      sections: d.sections.map((s) => (s.id === 'unknowns' ? { ...s, claims: [...s.claims, { text: ` ${WHO.replace(/ /g, '  ')} `, basis: 'unknown' as const }] } : s)),
      concerns: [...d.concerns, { id: 'c3', severity: 'low', text: RERUN, basis: 'inferred' }],
    };
    await writeDefense(dir, repeated);
    const claim = await sendFromDefense(dir, { defenseId: 'w-test', kind: 'claim', ref: 'security.1', types, now: T1 });
    const concern = await sendFromDefense(dir, { defenseId: 'w-test', kind: 'concern', ref: 'c3', types, now: T2 });
    await refused(dir, () => sendFromDefense(dir, { defenseId: 'w-test', kind: 'claim', ref: 'unknowns.1', types }), ConflictError, "That's already in Questions.");
    await refused(dir, () => sendFromDefense(dir, { defenseId: 'w-test', kind: 'concern', ref: 'c1', types }), ConflictError, "That's already in Concerns.");
    const asClaim = { kind: 'claim', itemId: claim.itemId, threadId: claim.threadId, typeId: 'questions', title: WHO, status: 'with_claude' };
    const asConcern = { kind: 'concern', itemId: concern.itemId, threadId: concern.threadId, typeId: 'concerns', title: RERUN, status: 'with_claude' };
    // Oldest first, and each item at its parts in the defense's order.
    expect((await defenseLinks(dir, repeated)).sent).toEqual([
      { ...asClaim, ref: 'security.1' },
      { ...asClaim, ref: 'unknowns.1' },
      { ...asConcern, ref: 'c1' },
      { ...asConcern, ref: 'c3' },
    ]);

    // An item sent from an earlier defense, too.
    const regenerated: WhiteboardDefense = { ...repeated, id: 'w-again' };
    await writeDefense(dir, regenerated);
    expect((await defenseLinks(dir, regenerated)).sent).toEqual([
      { ...asClaim, ref: 'security.1' },
      { ...asClaim, ref: 'unknowns.1' },
      { ...asConcern, ref: 'c1' },
      { ...asConcern, ref: 'c3' },
    ]);
  });

  it('refuses a known claim, a part sent before, a missing part, or a target type that is off or missing', async () => {
    const dir = await seed();
    const send = (kind: 'claim' | 'concern', ref: string, t: PlumbingType[] = types) => sendFromDefense(dir, { defenseId: 'w-test', kind, ref, types: t, now: T1 });
    await refused(dir, () => send('claim', 'security.0'), InputError, 'Only a claim marked Unknown or Verify before release can be sent to Questions.');
    await refused(dir, () => send('claim', 'security.9'), InputError, "That part of the Whiteboard Defense doesn't exist.");
    await refused(dir, () => send('concern', 'c9'), InputError, "That part of the Whiteboard Defense doesn't exist.");

    const off = types.map((t) => (t.id === 'questions' ? { ...t, enabled: false } : t));
    await refused(dir, () => send('claim', 'security.1', off), ConflictError, "There's no enabled Questions type to send it to. Turn it on in Plumbing rules.");
    const missing = types.filter((t) => t.id !== 'concerns');
    await refused(dir, () => send('concern', 'c1', missing), ConflictError, "There's no enabled Concerns type to send it to. Turn it on in Plumbing rules.");

    // Asking about a concern isn't sending it, so it can still be sent once.
    await askAboutDefense(dir, { defenseId: 'w-test', kind: 'concern', ref: 'c1', question: 'How likely is this?', now: T1 });
    await send('concern', 'c1');
    await send('claim', 'security.1');
    await refused(dir, () => send('concern', 'c1'), ConflictError, "That's already in Concerns.");
    await refused(dir, () => send('claim', 'security.1'), ConflictError, "That's already in Questions.");

    const empty = await seedProject();
    await refused(empty, () => sendFromDefense(empty, { defenseId: 'w-test', kind: 'claim', ref: 'security.1', types }), ConflictError, "There's no Whiteboard Defense yet.");
    await refused(
      dir,
      () => sendFromDefense(dir, { defenseId: 'w-older', kind: 'claim', ref: 'security.2', types }),
      ConflictError,
      'The Whiteboard Defense changed since this page loaded. Reload it.',
    );
  });
});

describe('the threads made from the Whiteboard Defense', () => {
  it('lists what was asked and what was sent, oldest first, for this defense only', async () => {
    const dir = await seed();
    // Asked in this order, which isn't the order of their ids.
    const earlier = await askAboutDefense(dir, { defenseId: 'w-test', kind: 'section', ref: 'security', question: 'Why not a queue?', now: T1 });
    await submit(dir, { scope: 'thread', threadId: earlier.threadId, types, now: T1 });
    const later = await askAboutDefense(dir, { defenseId: 'w-test', kind: 'question', ref: 'q1', question: 'And email?', now: T2 });
    const sent = await sendFromDefense(dir, { defenseId: 'w-test', kind: 'claim', ref: 'security.1', types, now: T3 });
    // Sent from the defense before this one, which a regenerate replaced, about a part this one doesn't have.
    const old = pair('questions-from-before', { title: 'From before' });
    await writeItem(dir, { ...old.item, createdBy: 'whiteboard', fromDefense: { id: 'w-older', kind: 'claim', ref: 'security.1', text: 'Something the new defense dropped.' } });
    await writeThread(dir, old.thread);

    expect(await defenseLinks(dir, defense())).toEqual({
      asked: [
        { kind: 'section', ref: 'security', itemId: 'defense-why-not-a-queue', threadId: earlier.threadId, typeId: 'defense', title: 'Why not a queue?', status: 'with_claude' },
        { kind: 'question', ref: 'q1', itemId: 'defense-and-email', threadId: later.threadId, typeId: 'defense', title: 'And email?', status: 'draft' },
      ],
      sent: [{ kind: 'claim', ref: 'security.1', itemId: sent.itemId, threadId: sent.threadId, typeId: 'questions', title: WHO, status: 'with_claude' }],
    });
  });
});
