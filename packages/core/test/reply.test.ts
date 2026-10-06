import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PLAN_CHANGES_TYPE } from '../src/planChanges';
import { undoChange } from '../src/store/changes';
import { InputError, projectFiles, readDecisions, readHistory, readItem, readItems, readThread, StoreError } from '../src/store/io';
import { postReply } from '../src/store/reply';
import { removeTempDirs } from '../../../testkit/tmp';
import { DRAFT, listType, pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const AT = '2026-10-01T10:00:00.000Z';
const asked = (id: string, extra: Parameters<typeof pair>[1] = {}) =>
  pair(id, { status: 'with_claude', messages: [{ id: `m-${id}`, at: AT, author: 'claude', text: 'Which one?' }, { id: `y-${id}`, at: AT, author: 'you', text: 'What would you do?' }], ...extra });
const draftOf = (dir: string) => fs.readFile(path.join(dir, 'docs', 'draft.md'), 'utf8');
const reply = (dir: string, r: Parameters<typeof postReply>[1]['reply'], autoApply = true) => postReply(dir, { reply: r, types: TYPES, autoApply, clone: '/nowhere' });

describe('posting a reply', () => {
  it('adds the message with options and gives the thread back to you', async () => {
    const dir = await seedProject({ pairs: [asked('q1')] });
    const r = await reply(dir, {
      threadId: 't-q1',
      text: 'One row per send keeps history for support.',
      options: [{ id: 'per-send', label: 'One row per send', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log one row per send.' }] } }, { id: 'per-sub', label: 'One row per subscription' }],
      recommended: 'per-send',
      filesRead: ['src/jobs/reminders.ts'],
    });
    const thread = await readThread(dir, 't-q1');
    expect(thread.status).toBe('your_turn');
    expect(thread.messages.at(-1)).toMatchObject({ id: r.messageId, author: 'claude', recommended: 'per-send', filesRead: ['src/jobs/reminders.ts'] });
    expect(await draftOf(dir)).toBe(DRAFT);
  });

  it('applies small edits straight away, and options are checked against the edited draft', async () => {
    const dir = await seedProject({ pairs: [asked('q1')] });
    const r = await reply(dir, {
      threadId: 't-q1',
      text: 'Fixed a typo. Which retention?',
      smallEdits: [{ summary: 'Clearer wording in Data', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log each reminder in a table.' }] } }],
      options: [{ id: 'keep', label: 'Keep 180 days', change: { md: [{ find: 'Log each reminder in a table.', replace: 'Log each reminder in a table for 180 days.' }] } }],
    });
    expect(await draftOf(dir)).toContain('Log each reminder in a table.');
    expect(r.edits).toHaveLength(1);
    expect(r.edits[0]?.appliedAt).toBeDefined();
    expect((await readThread(dir, 't-q1')).messages.at(-1)).toMatchObject({ smallEdits: [{ changeId: r.edits[0]?.id, summary: 'Clearer wording in Data' }] });
  });

  it('keeps small edits pending when auto-apply is off', async () => {
    const dir = await seedProject({ pairs: [asked('q1')] });
    const r = await reply(dir, { threadId: 't-q1', text: 'Tidied.', smallEdits: [{ summary: 'Wording', change: { md: [{ find: 'a table', replace: 'one table' }] } }] }, false);
    expect(r.edits[0]?.appliedAt).toBeUndefined();
    expect(await draftOf(dir)).toBe(DRAFT);
  });

  it('opens new threads and flags items it might affect', async () => {
    const dir = await seedProject({ pairs: [asked('q1'), pair('c1', { type: 'concerns' })] });
    const r = await reply(dir, {
      threadId: 't-q1',
      text: 'This raises a retention question.',
      newItems: [{ type: 'questions', title: 'Is 180 days enough for audits?', summary: 'Retention vs audits.', message: { text: 'Do audits need longer?' } }],
      impacts: [{ itemId: 'c1', reason: 'Retention changes the burst risk.' }],
    });
    expect(r.newThreadIds).toEqual(['t-questions-is-180-days-enough-for-audits']);
    expect(await readItem(dir, 'questions-is-180-days-enough-for-audits')).toMatchObject({ createdBy: 'claude', links: ['q1'] });
    expect((await readThread(dir, 't-questions-is-180-days-enough-for-audits')).status).toBe('your_turn');
    expect((await readItem(dir, 'c1')).flags).toEqual([{ reason: 'Retention changes the burst risk.', fromThreadId: 't-q1', at: expect.any(String) }]);
  });

  it("clears the reviewed mark on an item it flags, so it's back on the Finalize warning list", async () => {
    const c1 = pair('c1', { type: 'concerns' });
    const c2 = pair('c2', { type: 'concerns' });
    const dir = await seedProject({ pairs: [asked('q1'), { ...c1, item: { ...c1.item, reviewedAt: AT } }, { ...c2, item: { ...c2.item, reviewedAt: AT } }] });
    await reply(dir, { threadId: 't-q1', text: 'This changes the burst risk.', impacts: [{ itemId: 'c1', reason: 'Retention changes the burst risk.' }] });
    const flagged = await readItem(dir, 'c1');
    expect(flagged.flags).toHaveLength(1);
    expect('reviewedAt' in flagged).toBe(false);
    // An item the reply doesn't flag keeps its mark.
    expect((await readItem(dir, 'c2')).reviewedAt).toBe(AT);
  });

  it('resolves the thread with a decision', async () => {
    const dir = await seedProject({ pairs: [asked('q1')] });
    await reply(dir, { threadId: 't-q1', text: 'Settled.', resolve: { decision: 'Reminders go by SMS and email' } });
    expect((await readThread(dir, 't-q1')).status).toBe('resolved');
    expect((await readThread(dir, 't-q1')).messages.at(-1)).toMatchObject({ resolved: true });
    expect(await readDecisions(dir)).toEqual([expect.objectContaining({ text: 'Reminders go by SMS and email', threadId: 't-q1', itemIds: ['q1'] })]);
  });

  it('a bad reply writes nothing and lists every problem', async () => {
    const dir = await seedProject({ pairs: [asked('q1')] });
    const attempt = reply(dir, {
      threadId: 't-q1',
      text: 'x',
      options: [{ id: 'a', label: 'A', change: { md: [{ find: 'Nowhere in the draft', replace: 'y' }] } }],
      recommended: 'b',
      resolve: { decision: 'Both' },
      smallEdits: [{ summary: 'Delete', change: { md: [{ find: 'Log reminders in a table.', replace: '' }] } }],
      newItems: [{ type: 'nope', title: 'T', summary: 's', message: { text: 'm' } }],
      impacts: [{ itemId: 'ghost', reason: 'r' }],
    });
    await expect(attempt).rejects.toThrow(InputError);
    const message = await attempt.catch((e: Error) => e.message);
    for (const bit of [/options or resolve/, /recommended is "b"/, /isn't in the draft/, /can't delete text outright/, /"nope" isn't an enabled plumbing type/, /no item "ghost"/]) {
      expect(message).toMatch(bit);
    }
    expect((await readThread(dir, 't-q1')).messages).toHaveLength(2);
    expect(await draftOf(dir)).toBe(DRAFT);
    expect(await readHistory(dir)).toEqual([]);
  });

  it("won't make a Plan changes item: only an update makes those", async () => {
    const dir = await seedProject({ pairs: [asked('q1')] });
    const attempt = postReply(dir, {
      reply: { threadId: 't-q1', text: 'This changes the plan.', newItems: [{ type: 'plan-changes', title: 'Approach', summary: 'A summary.', message: { text: 'Merge it?' } }] },
      types: [PLAN_CHANGES_TYPE, ...TYPES],
      autoApply: true,
      clone: '/nowhere',
    });
    await expect(attempt).rejects.toThrow('New item 1 (Approach): "plan-changes" isn\'t an enabled plumbing type. Use one of: architecture, questions, concerns.');
    expect((await readItems(dir)).values.map((i) => i.id)).toEqual(['q1']);
  });

  it('takes three options on a Plan changes thread, each ready to accept, Keep my draft with a change that changes nothing', async () => {
    const dir = await seedProject({ pairs: [asked('plan-changes-v2-1', { type: 'plan-changes', title: 'Data' })] });
    await postReply(dir, {
      reply: {
        threadId: 't-plan-changes-v2-1',
        text: 'You log one row per send, and the repo moved the log to the events table. The merged version keeps both.',
        options: [
          { id: 'merged', label: 'Use the merged version', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log one row per send in the events table.' }] } },
          { id: 'theirs', label: "Take the repo's version", change: { md: [{ find: 'Log reminders in a table.', replace: 'Log reminders in the events table.' }] } },
          { id: 'keep', label: 'Keep my draft', change: { md: [] } },
        ],
        recommended: 'merged',
      },
      types: [PLAN_CHANGES_TYPE, ...TYPES],
      autoApply: true,
      clone: '/nowhere',
    });
    const thread = await readThread(dir, 't-plan-changes-v2-1');
    expect(thread.status).toBe('your_turn');
    expect(thread.messages.at(-1)).toMatchObject({ author: 'claude', recommended: 'merged', options: [{ id: 'merged' }, { id: 'theirs' }, { id: 'keep', change: { md: [] } }] });
    expect(await draftOf(dir)).toBe(DRAFT);
  });

  it('parks the thread once the reply lands when an update took its item out of the plan, keeping the reply and any decision', async () => {
    const open = asked('q1');
    const settled = asked('q2');
    const dir = await seedProject({ pairs: [open, settled].map((p) => ({ ...p, item: { ...p.item, removedIn: 2 } })) });
    const asking = await reply(dir, { threadId: 't-q1', text: 'Which retention?', options: [{ id: 'short', label: '30 days' }, { id: 'long', label: '1 year' }] });
    const resolving = await reply(dir, { threadId: 't-q2', text: 'Settled.', resolve: { decision: 'Reminders go by SMS and email' } });
    const line = { author: 'system', text: 'Parked, because it was removed from the plan in v2.' };
    for (const [threadId, messageId] of [['t-q1', asking.messageId], ['t-q2', resolving.messageId]]) {
      const thread = await readThread(dir, threadId);
      expect(thread.status).toBe('parked');
      expect(thread.messages.slice(-2)).toMatchObject([{ id: messageId, author: 'claude' }, line]);
    }
    expect((await readThread(dir, 't-q2')).messages.at(-2)).toMatchObject({ resolved: true });
    expect(await readDecisions(dir)).toEqual([expect.objectContaining({ text: 'Reminders go by SMS and email', threadId: 't-q2', itemIds: ['q2'] })]);
    // The items stay removed, so the checklist says why they're parked.
    expect((await readItem(dir, 'q1')).removedIn).toBe(2);
    expect((await readItem(dir, 'q2')).removedIn).toBe(2);
  });

  it("refuses threads that aren't waiting for Claude", async () => {
    const dir = await seedProject({ pairs: [pair('q1')] });
    await expect(reply(dir, { threadId: 't-q1', text: 'x' })).rejects.toThrow(/isn't waiting for Claude/);
    await expect(reply(dir, { threadId: 't-ghost', text: 'x' })).rejects.toThrow(/no thread "t-ghost"/);
  });
});

describe('a reply is all or nothing', () => {
  const smallEdit = { summary: 'Wording', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log each reminder in a table.' }] } };
  const newItem = { type: 'questions', title: 'Is 180 days enough?', summary: 's', message: { text: 'm' } };

  it('a valid small edit next to a bad option writes nothing', async () => {
    const dir = await seedProject({ pairs: [asked('q1')] });
    const before = (await readItems(dir)).values.map((i) => i.id).sort();
    const attempt = reply(dir, {
      threadId: 't-q1',
      text: 'x',
      smallEdits: [smallEdit],
      newItems: [newItem],
      options: [{ id: 'a', label: 'A', change: { md: [{ find: 'Nowhere in the draft', replace: 'y' }] } }],
    });
    await expect(attempt).rejects.toThrow(InputError);
    expect(await draftOf(dir)).toBe(DRAFT);
    expect(await readHistory(dir)).toEqual([]);
    expect((await readItems(dir)).values.map((i) => i.id).sort()).toEqual(before);
    expect((await readThread(dir, 't-q1')).messages).toHaveLength(2);
  });

  it('a damaged decisions.json stops a resolving reply before anything is written', async () => {
    const dir = await seedProject({ pairs: [asked('q1')] });
    await fs.writeFile(projectFiles(dir).decisions, '{broken');
    const before = (await readItems(dir)).values.map((i) => i.id).sort();
    await expect(reply(dir, { threadId: 't-q1', text: 'Done.', smallEdits: [smallEdit], newItems: [newItem], resolve: { decision: 'Go' } })).rejects.toThrow(StoreError);
    expect(await draftOf(dir)).toBe(DRAFT);
    expect(await readHistory(dir)).toEqual([]);
    expect((await readItems(dir)).values.map((i) => i.id).sort()).toEqual(before);
    expect((await readThread(dir, 't-q1')).status).toBe('with_claude');
  });
});

describe('drawings in replies', () => {
  const ui = listType('ui', { title: 'UI changes', screen: 'mockups', order: 3 });
  const flows = listType('flows', { title: 'Flows', screen: 'flows', order: 4 });
  const phases = listType('phases', { title: 'Phases & milestones', timeline: true, order: 7 });
  const ALL = [...TYPES, ui, flows, phases];
  const drawingReply = (dir: string, r: Parameters<typeof postReply>[1]['reply']) => postReply(dir, { reply: r, types: ALL, autoApply: true, clone: '/nowhere' });
  const withData = (p: ReturnType<typeof pair>, data: unknown) => ({ ...p, item: { ...p.item, data } });
  const signup = {
    kind: 'system',
    lanes: [
      { id: 'web', label: 'Web app', status: 'changed' },
      { id: 'db', label: 'Postgres', status: 'unchanged' },
    ],
    steps: [
      { n: 1, from: 'web', to: 'db', label: 'Save the lead time' },
      { n: 2, from: 'web', to: 'web', label: 'Show the saved card' },
    ],
  };
  const map = {
    kind: 'system',
    groups: [],
    nodes: [
      { id: 'job', label: 'Daily reminder job', status: 'new' },
      { id: 'db', label: 'Postgres', status: 'unchanged' },
    ],
    edges: [{ id: 'e1', from: 'job', to: 'db' }],
  };

  it('a reply whose data patch breaks a reference writes nothing', async () => {
    // Review Focus 4: one bad patch of each kind, each in its own option.
    const phase = { order: 1, goal: 'Ship.', doneWhen: ['Live'], itemIds: ['flows-save'] };
    const card = { location: { app: 'web', route: '/account', files: [] }, kit: 'web', after: '<div class="p-4">Restock soon</div>' };
    const dir = await seedProject({
      pairs: [
        withData(asked('flows-save', { type: 'flows' }), signup),
        withData(pair('architecture-map', { type: 'architecture' }), map),
        withData(pair('phases-build', { type: 'phases' }), phase),
        withData(pair('ui-card', { type: 'ui' }), card),
      ],
    });
    const broken = {
      flow: { ...signup, steps: [...signup.steps, { n: 3, from: 'queue', to: 'db', label: 'Retry later' }] },
      diagram: { ...map, edges: [...map.edges, { id: 'e2', from: 'job', to: 'email' }] },
      phase: { ...phase, itemIds: ['flows-save', 'ghost'] },
      mockup: { ...card, after: '<div class="p-4">Restock soon</div><script>alert(1)</script>' },
    };
    const attempt = drawingReply(dir, {
      threadId: 't-flows-save',
      text: 'A queue would let failed saves retry.',
      smallEdits: [{ summary: 'Wording', change: { md: [{ find: 'Log reminders in a table.', replace: 'Log each reminder in a table.' }] } }],
      options: [
        { id: 'queue', label: 'Retry through a queue', change: { items: [{ itemId: 'flows-save', patch: { data: broken.flow } }] } },
        { id: 'email', label: 'Send an email too', change: { items: [{ itemId: 'architecture-map', patch: { data: broken.diagram } }] } },
        { id: 'later', label: 'Plan it in the first phase', change: { items: [{ itemId: 'phases-build', patch: { data: broken.phase } }] } },
        { id: 'banner', label: 'Show it on the card', change: { items: [{ itemId: 'ui-card', patch: { data: broken.mockup } }] } },
        { id: 'keep', label: 'Keep it as it is' },
      ],
    });
    await expect(attempt).rejects.toThrow(InputError);
    const message = await attempt.catch((e: Error) => e.message);
    expect(message).toMatch(/Option "queue": Item "flows-save": Step 3 starts on lane "queue", which isn't one of the lane ids\./);
    expect(message).toMatch(/Option "email": Item "architecture-map": Edge "e2" ends at "email", which isn't one of the node ids\./);
    expect(message).toMatch(/Option "later": Item "phases-build": itemIds: there's no item "ghost"\./);
    expect(message).toMatch(/Option "banner": Item "ui-card": after: remove the <script> tags\. Mockups can't run scripts\./);
    // Nothing is written: not the small edit, not the message, not any item.
    const thread = await readThread(dir, 't-flows-save');
    expect(thread.status).toBe('with_claude');
    expect(thread.messages).toHaveLength(2);
    expect(await draftOf(dir)).toBe(DRAFT);
    expect(await readHistory(dir)).toEqual([]);
    expect((await readItem(dir, 'flows-save')).data).toEqual(signup);
    expect((await readItem(dir, 'architecture-map')).data).toEqual(map);
    expect((await readItem(dir, 'phases-build')).data).toEqual(phase);
    expect((await readItem(dir, 'ui-card')).data).toEqual(card);
  });

  it('a small edit with valid data applies and can be undone', async () => {
    const dir = await seedProject({ pairs: [withData(asked('architecture-map', { type: 'architecture' }), map)] });
    const renamed = { ...map, nodes: [{ id: 'job', label: 'Nightly reminder job', status: 'new' }, map.nodes[1]] };
    const r = await drawingReply(dir, {
      threadId: 't-architecture-map',
      text: 'Renamed the job box.',
      smallEdits: [{ summary: 'Box name', change: { items: [{ itemId: 'architecture-map', patch: { data: renamed } }] } }],
    });
    expect((await readItem(dir, 'architecture-map')).data).toEqual(renamed);
    await undoChange(dir, r.edits[0].id);
    expect((await readItem(dir, 'architecture-map')).data).toEqual(map);
  });

  it("checks small edits' and new items' data against the project", async () => {
    const phase = { order: 1, goal: 'Ship.', doneWhen: ['Live'], itemIds: [] };
    const dir = await seedProject({ pairs: [asked('q1'), withData(pair('phases-build', { type: 'phases' }), phase)] });
    const attempt = drawingReply(dir, {
      threadId: 't-q1',
      text: 'x',
      smallEdits: [{ summary: 'Phase items', change: { items: [{ itemId: 'phases-build', patch: { data: { ...phase, itemIds: ['ghost'] } } }] } }],
      newItems: [
        { type: 'flows', title: 'Turn on reminders', summary: 's', data: { kind: 'user', steps: [{ n: 1, label: 'Opens settings', mockupId: 'q1' }] }, message: { text: 'Is this the flow?' } },
        { type: 'questions', title: 'Lead time?', summary: 's', data: { order: 1 }, message: { text: 'How many days?' } },
      ],
    });
    await expect(attempt).rejects.toThrow(InputError);
    const message = await attempt.catch((e: Error) => e.message);
    expect(message).toMatch(/Small edit 1: Item "phases-build": itemIds: there's no item "ghost"\./);
    expect(message).toMatch(/New item 1 \(Turn on reminders\): Step 1: mockupId "q1" isn't a UI item\./);
    expect(message).toMatch(/New item 2 \(Lead time\?\): This plumbing type's items don't take data\./);
    expect((await readItems(dir)).values).toHaveLength(2);
    expect(await readHistory(dir)).toEqual([]);
  });

  it('a new flow may point at a UI item from the same reply', async () => {
    const dir = await seedProject({ pairs: [asked('q1')] });
    const r = await drawingReply(dir, {
      threadId: 't-q1',
      text: 'Here is the screen, and the flow through it.',
      newItems: [
        { type: 'ui', title: 'Restock card', summary: 's', data: { location: { app: 'web', route: '/account', files: [] }, kit: 'web', after: '<div class="p-4">Restock soon</div>' }, message: { text: 'Like this?' } },
        { type: 'flows', title: 'Turn on reminders', summary: 's', data: { kind: 'user', steps: [{ n: 1, label: 'Opens the card', mockupId: 'ui-restock-card' }] }, message: { text: 'And this flow?' } },
      ],
    });
    expect(r.newThreadIds).toEqual(['t-ui-restock-card', 't-flows-turn-on-reminders']);
  });

  it('items without data still take replies', async () => {
    const legacyUi = withData(asked('ui-account', { type: 'ui' }), { location: { app: 'web', route: '/account', files: [] }, kit: 'web' });
    const dir = await seedProject({ pairs: [legacyUi, asked('flows-old', { type: 'flows' })] });
    await drawingReply(dir, { threadId: 't-ui-account', text: 'Renamed it.', smallEdits: [{ summary: 'Title', change: { items: [{ itemId: 'ui-account', patch: { title: 'Account page' } }] } }] });
    await drawingReply(dir, {
      threadId: 't-flows-old',
      text: 'Which way?',
      options: [
        { id: 'short', label: 'Shorter summary', change: { items: [{ itemId: 'flows-old', patch: { summary: 'Shorter.' } }] } },
        { id: 'keep', label: 'Keep it' },
      ],
    });
    expect((await readItem(dir, 'ui-account')).title).toBe('Account page');
    expect((await readThread(dir, 't-flows-old')).status).toBe('your_turn');
  });
});
