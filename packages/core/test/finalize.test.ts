import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { diagramMermaid } from '../src/finalExport';
import type { DiagramData, MockupData } from '../src/schemas';
import { addDecision } from '../src/store/decisions';
import {
  discardProposal,
  draftHash,
  finalInputsHash,
  finalName,
  finishFinalize,
  pickUpFinalize,
  readFinalize,
  requestFinalize,
  requeueFinalize,
  saveProposal,
} from '../src/store/finalize';
import { readItem, writeItem } from '../src/store/io';
import { removeTempDirs } from '../../../testkit/tmp';
import { DRAFT, listType, pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const T0 = new Date('2026-10-03T09:00:00.000Z');
const T1 = new Date('2026-10-03T09:01:00.000Z');
const T2 = new Date('2026-10-03T09:02:00.000Z');
const T3 = new Date('2026-10-03T09:03:00.000Z');
const types = [...TYPES, listType('ui', { title: 'UI changes', screen: 'mockups', order: 3 })];

const DIAGRAM: DiagramData = {
  kind: 'system',
  groups: [],
  nodes: [
    { id: 'job', label: 'Daily reminder job', status: 'new' },
    { id: 'db', label: 'Postgres', status: 'unchanged' },
  ],
  edges: [{ id: 'e1', from: 'job', to: 'db', label: 'finds due subscriptions' }],
};
const MOCKUP: MockupData = { location: { app: 'web', route: '/account', files: [] }, kit: 'web', after: '<main class="p-6">Reminders on</main>' };
const FINAL = '# Restock reminders\n\n## Architecture\n\n{{diagram:architecture-system}}\n\n## UI changes\n\nThe account page: {{mockup:ui-account:after}}.\n';

/** A project with a diagram, a mockup and a blocking question (resolved unless `blocked`), plus a high concern when blocked. */
async function seed(o: { blocked?: boolean } = {}): Promise<string> {
  const diagram = pair('architecture-system', { type: 'architecture', title: 'System overview', status: 'resolved' });
  diagram.item.data = DIAGRAM;
  const mockup = pair('ui-account', { type: 'ui', title: 'Account page', status: 'resolved' });
  mockup.item.data = MOCKUP;
  const question = pair('q1', { title: 'Who gets reminders?', fields: { blocking: 'true' }, status: o.blocked ? 'your_turn' : 'resolved' });
  const concern = pair('c1', { type: 'concerns', title: 'Duplicate emails', fields: { severity: 'high' }, status: o.blocked ? 'your_turn' : 'resolved' });
  return seedProject({ pairs: [diagram, mockup, question, concern] });
}

const proposalFile = (dir: string) => path.join(dir, 'docs', 'final.proposed.md');
const exists = (file: string) => fs.access(file).then(() => true, () => false);
/** The error a promise rejects with, as its class name and message, or null if it resolves. */
const refusal = (p: Promise<unknown>) => p.then(() => null, (e: Error) => ({ type: e.constructor.name, message: e.message }));

describe('finalize requests', () => {
  it('go from requested to writing to proposed, with the final expanded', async () => {
    const dir = await seed();
    const request = await requestFinalize(dir, { types, now: T0 });
    expect(request).toEqual({ id: expect.stringMatching(/^f-/), state: 'requested', requestedAt: T0.toISOString() });
    expect(await readFinalize(dir)).toEqual(request);
    expect(await refusal(requestFinalize(dir, { types }))).toEqual({ type: 'ConflictError', message: 'Finalize is already under way.' });

    const writing = await pickUpFinalize(dir, 'w-a', T1);
    expect(writing).toEqual({ ...request, state: 'writing', pickedUpAt: T1.toISOString(), pickedUpBy: 'w-a', inputsHash: await finalInputsHash(dir) });
    expect(await pickUpFinalize(dir, 'w-b', T1)).toBeNull();
    expect(await refusal(requestFinalize(dir, { types }))).toEqual({ type: 'ConflictError', message: 'Finalize is already under way.' });

    const inputs = await finalInputsHash(dir);
    const proposed = await saveProposal(dir, { requestId: request.id, markdown: FINAL, types, name: 'restock', now: T2 });
    const text = await fs.readFile(proposalFile(dir), 'utf8');
    expect(text).toBe(
      `# Restock reminders\n\n## Architecture\n\n${diagramMermaid(DIAGRAM)}\n\n## UI changes\n\nThe account page: [After mockup](restock.assets/ui-account.after.html).\n`,
    );
    expect(proposed).toEqual({
      ...writing,
      state: 'proposed',
      proposal: { at: T2.toISOString(), draftHash: inputs, file: 'docs/final.proposed.md', length: text.length, assets: [{ itemId: 'ui-account', side: 'after' }] },
    });
    expect(await readFinalize(dir)).toEqual(proposed);
    expect(await pickUpFinalize(dir, 'w-b')).toBeNull();
    // The window reporting back after its finalizer sent a final leaves the proposal as it is.
    await finishFinalize(dir, { requestId: request.id, windowId: 'w-a' });
    expect(await readFinalize(dir)).toEqual(proposed);
  });

  it("can't start while something blocks, and say what", async () => {
    const dir = await seed({ blocked: true });
    expect(await refusal(requestFinalize(dir, { types }))).toEqual({
      type: 'ConflictError',
      message: 'Finalize is blocked:\n- Who gets reminders?: Blocking question, not resolved.\n- Duplicate emails: High-severity concern, not resolved.',
    });
    expect(await readFinalize(dir)).toBeNull();
  });

  it("can't start while the plan is still being imported", async () => {
    const dir = await seedProject({ project: { status: 'importing' } });
    expect(await refusal(requestFinalize(dir, { types }))).toEqual({ type: 'ConflictError', message: 'Wait for the import to finish, then finalize.' });
    expect(await readFinalize(dir)).toBeNull();
  });

  it('a refused proposal saves nothing', async () => {
    const dir = await seed();
    const request = await requestFinalize(dir, { types });
    await pickUpFinalize(dir, 'w-a');
    const before = await readFinalize(dir);
    const save = (markdown: string, requestId = request.id) => refusal(saveProposal(dir, { requestId, markdown, types, name: 'restock' }));
    expect(await save('# Final\n\n{{diagram:architecture-gone}}\n\n{{sequence:architecture-system}}\n\nLeft {{over}}.\n')).toEqual({
      type: 'InputError',
      message: [
        'Nothing was saved. Fix these and call dp_finalize again with the whole document:',
        '- {{diagram:architecture-gone}}: there\'s no item "architecture-gone".',
        '- {{sequence:architecture-system}}: "System overview" isn\'t a flow item.',
        '- Unknown token: {{over}}.',
      ].join('\n'),
    });
    expect(await save('  \n')).toEqual({
      type: 'InputError',
      message: 'Nothing was saved. Fix these and call dp_finalize again with the whole document:\n- The final is empty. Send the whole document.',
    });
    expect(await save('x'.repeat(500_001))).toEqual({
      type: 'InputError',
      message: 'Nothing was saved. Fix these and call dp_finalize again with the whole document:\n- The final is 500,001 characters; it can be at most 500,000.',
    });
    expect(await save(FINAL, 'f-other')).toEqual({ type: 'ConflictError', message: "There's no finalize request f-other waiting for a final." });
    expect(await readFinalize(dir)).toEqual(before);
    expect(await exists(proposalFile(dir))).toBe(false);
  });

  it('refuses tokens for parked items and items of disabled types, saving nothing', async () => {
    const old = pair('architecture-old', { type: 'architecture', title: 'Old overview', status: 'parked' });
    old.item.data = DIAGRAM;
    const hidden = pair('ui-hidden', { type: 'ui', title: 'Hidden page', status: 'resolved' });
    hidden.item.data = MOCKUP;
    const dir = await seedProject({ pairs: [old, hidden] });
    const off = [...TYPES, listType('ui', { title: 'UI changes', screen: 'mockups', order: 3, enabled: false })];
    const request = await requestFinalize(dir, { types: off });
    await pickUpFinalize(dir, 'w-a');
    const before = await readFinalize(dir);
    const markdown = '# Final\n\n{{diagram:architecture-old}}\n\nThe page: {{mockup:ui-hidden:after}}.\n';
    expect(await refusal(saveProposal(dir, { requestId: request.id, markdown, types: off, name: 'restock' }))).toEqual({
      type: 'InputError',
      message: [
        'Nothing was saved. Fix these and call dp_finalize again with the whole document:',
        '- {{diagram:architecture-old}}: "Old overview" is parked, so it\'s left out of the final.',
        '- {{mockup:ui-hidden:after}}: there\'s no item "ui-hidden".',
      ].join('\n'),
    });
    expect(await readFinalize(dir)).toEqual(before);
    expect(await exists(proposalFile(dir))).toBe(false);
  });

  it('a finalize request survives a window that went away', async () => {
    const dir = await seed();
    const request = await requestFinalize(dir, { types, now: T0 });
    await pickUpFinalize(dir, 'w-dead', T1);
    expect(await requeueFinalize(dir, (w) => w === 'w-live', T2)).toBe(true);
    expect(await readFinalize(dir)).toEqual({ ...request, state: 'requested', requeuedAt: T2.toISOString() });
    expect(await pickUpFinalize(dir, 'w-live', T3)).toMatchObject({ id: request.id, state: 'writing', pickedUpBy: 'w-live' });
    expect(await requeueFinalize(dir, (w) => w === 'w-live')).toBe(false);
    await saveProposal(dir, { requestId: request.id, markdown: FINAL, types, name: 'restock' });
    // A proposal is finished work: it never goes back in the queue.
    expect(await requeueFinalize(dir, () => false)).toBe(false);
    expect((await readFinalize(dir))?.state).toBe('proposed');
  });

  it("fail when the finalizer returns without a final, and only for that window's request", async () => {
    const dir = await seed();
    const request = await requestFinalize(dir, { types, now: T0 });
    await pickUpFinalize(dir, 'w-a', T1);
    await finishFinalize(dir, { requestId: request.id, windowId: 'w-b', now: T2 });
    await finishFinalize(dir, { requestId: 'f-other', windowId: 'w-a', now: T2 });
    expect((await readFinalize(dir))?.state).toBe('writing');
    await finishFinalize(dir, { requestId: request.id, windowId: 'w-a', now: T2 });
    expect(await readFinalize(dir)).toEqual({
      ...request,
      state: 'failed',
      pickedUpAt: T1.toISOString(),
      pickedUpBy: 'w-a',
      inputsHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      failedAt: T2.toISOString(),
      reason: "The finalizer didn't send a final.",
    });
    expect(await refusal(saveProposal(dir, { requestId: request.id, markdown: FINAL, types, name: 'restock' }))).toEqual({
      type: 'ConflictError',
      message: `There's no finalize request ${request.id} waiting for a final.`,
    });
  });

  it('a new start replaces a failed request, or an earlier proposal and its file', async () => {
    const dir = await seed();
    const first = await requestFinalize(dir, { types });
    await pickUpFinalize(dir, 'w-a');
    await finishFinalize(dir, { requestId: first.id, windowId: 'w-a' });
    const second = await requestFinalize(dir, { types });
    expect(second.id).not.toBe(first.id);
    expect(await readFinalize(dir)).toEqual(second);
    await pickUpFinalize(dir, 'w-a');
    await saveProposal(dir, { requestId: second.id, markdown: FINAL, types, name: 'restock' });
    expect(await exists(proposalFile(dir))).toBe(true);
    const third = await requestFinalize(dir, { types });
    expect(await readFinalize(dir)).toEqual(third);
    expect(await exists(proposalFile(dir))).toBe(false);
  });

  it('discard removes the request and its proposal', async () => {
    const dir = await seed();
    const request = await requestFinalize(dir, { types });
    await pickUpFinalize(dir, 'w-a');
    await saveProposal(dir, { requestId: request.id, markdown: FINAL, types, name: 'restock' });
    await discardProposal(dir);
    expect(await readFinalize(dir)).toBeNull();
    expect(await exists(proposalFile(dir))).toBe(false);
    await expect(discardProposal(dir)).resolves.toBeUndefined();
  });
});

describe('final names and fingerprints', () => {
  it("names the final after the plan's file", () => {
    expect(finalName('docs/specs/restock-reminders.md')).toBe('restock-reminders');
    expect(finalName('Plans/Big Plan.MARKDOWN')).toBe('Big Plan');
    expect(finalName('notes.v2.md')).toBe('notes.v2');
  });

  it('hashes the draft with sha256', () => {
    expect(draftHash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(draftHash(DRAFT)).not.toBe(draftHash(`${DRAFT}\nOne more line.\n`));
  });

  it('a proposal goes stale when only an item changes, with the draft as it was', async () => {
    const dir = await seed();
    const request = await requestFinalize(dir, { types });
    await pickUpFinalize(dir, 'w-a');
    const { proposal } = await saveProposal(dir, { requestId: request.id, markdown: FINAL, types, name: 'restock' });
    expect(proposal?.draftHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await finalInputsHash(dir)).toBe(proposal?.draftHash);
    // The same data written with its keys in another order is the same input.
    const item = await readItem(dir, 'architecture-system');
    await writeItem(dir, { ...item, data: Object.fromEntries(Object.entries(DIAGRAM).reverse()) });
    expect(await finalInputsHash(dir)).toBe(proposal?.draftHash);
    // A review flag is a mark, not content: it doesn't make the proposal stale.
    await writeItem(dir, { ...item, flags: [{ reason: 'May need another look', fromThreadId: 't-q1', at: '2026-10-03T00:00:00.000Z' }] });
    expect(await finalInputsHash(dir)).toBe(proposal?.draftHash);
    // An accept that only redraws the diagram changes the final's Mermaid, so the proposal is stale.
    await writeItem(dir, { ...item, data: { ...DIAGRAM, nodes: [...DIAGRAM.nodes, { id: 'mail', label: 'Mailer', status: 'new' }] } });
    expect(await fs.readFile(path.join(dir, 'docs', 'draft.md'), 'utf8')).toBe(DRAFT);
    expect(await finalInputsHash(dir)).not.toBe(proposal?.draftHash);
  });

  it('a proposal is stale when an item changed after the finalizer picked the request up', async () => {
    const dir = await seed();
    const request = await requestFinalize(dir, { types });
    await pickUpFinalize(dir, 'w-a');
    const item = await readItem(dir, 'architecture-system');
    await writeItem(dir, { ...item, data: { ...DIAGRAM, nodes: [...DIAGRAM.nodes, { id: 'mail', label: 'Mailer', status: 'new' }] } });
    const { proposal } = await saveProposal(dir, { requestId: request.id, markdown: FINAL, types, name: 'restock' });
    expect(proposal?.draftHash).not.toBe(await finalInputsHash(dir));
  });

  it('a new decision changes the final inputs too', async () => {
    const dir = await seed();
    const before = await finalInputsHash(dir);
    await addDecision(dir, { text: 'Remind three days before.', threadId: 't-q1', itemIds: ['q1'] });
    expect(await finalInputsHash(dir)).not.toBe(before);
  });
});
