import { afterAll, describe, expect, it } from 'vitest';
import type { Anchor, Item, Thread } from '../src/schemas';
import { readItem, readItems } from '../src/store/io';
import { addOwnItem } from '../src/store/threads';
import { removeTempDirs } from '../../../testkit/tmp';
import { listType, pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const architecture = TYPES.find((t) => t.id === 'architecture')!;
const questions = TYPES.find((t) => t.id === 'questions')!;
const flows = listType('flows', { title: 'Flows', screen: 'flows', order: 4 });
const ui = listType('ui', { title: 'UI changes', screen: 'mockups', order: 3 });

const diagram = {
  kind: 'system',
  groups: [],
  nodes: [
    { id: 'job', label: 'Daily job', status: 'new' },
    { id: 'db', label: 'Subscriptions table', status: 'unchanged' },
  ],
  edges: [{ id: 'reads', from: 'job', to: 'db' }],
};
const flow = { kind: 'user', steps: [{ n: 1, label: 'Open account settings' }, { n: 2, label: 'Turn reminders on' }] };
const mockup = { location: { app: 'web', route: '/account', files: [] }, kit: 'web', after: '<div class="p-4">Restock soon</div>' };
const drawn = (p: { item: Item; thread: Thread }, data: unknown) => ({ ...p, item: { ...p.item, data } });
const node: Anchor = { itemId: 'a1', kind: 'node', ref: 'job', label: 'Daily job' };

const project = () =>
  seedProject({
    pairs: [
      drawn(pair('a1', { type: 'architecture', title: 'System view' }), diagram),
      drawn(pair('a2', { type: 'architecture', title: 'Old view' }), { nodes: 'boxes' }),
      drawn(pair('f1', { type: 'flows', title: 'Turning reminders on' }), flow),
      drawn(pair('u1', { type: 'ui', title: 'Settings card' }), mockup),
      pair('q1'),
    ],
  });

describe('asking about one part of a drawing', () => {
  it('pins a new item to a box, linked to its diagram, with your message ready to send', async () => {
    const dir = await project();
    const { item, thread } = await addOwnItem(dir, { type: architecture, title: 'About the daily job', text: 'What time does it run?', anchor: node });
    expect(item).toMatchObject({ id: 'architecture-about-the-daily-job', type: 'architecture', anchor: node, links: ['a1'], createdBy: 'you' });
    expect(thread).toMatchObject({ status: 'idle', draft: { text: 'What time does it run?' }, messages: [] });
    expect((await readItem(dir, item.id)).anchor).toEqual(node);
    expect((await readItem(dir, 'a1')).data).toEqual(diagram);
  });

  it('pins to a flow step, and to a mockup element without checking the selector', async () => {
    const dir = await project();
    const step = await addOwnItem(dir, { type: flows, title: 'Where is the toggle?', text: 'On the account page?', anchor: { itemId: 'f1', kind: 'step', ref: '2', label: 'Step 2: Turn reminders on' } });
    expect(step.item).toMatchObject({ links: ['f1'], anchor: { kind: 'step', ref: '2' } });
    const element: Anchor = { itemId: 'u1', kind: 'element', ref: 'body > section:nth-of-type(3)', label: 'Not drawn yet', side: 'before' };
    const pin = await addOwnItem(dir, { type: ui, title: 'Bigger card?', text: 'Can it be wider?', anchor: element });
    expect(pin.item.anchor).toEqual(element);
  });

  it('refuses a pin that points nowhere, or at the wrong kind of thing, and writes nothing', async () => {
    const dir = await project();
    const ask = (type: typeof architecture, anchor: Anchor) => addOwnItem(dir, { type, title: 'A pin', text: 'Why?', anchor });
    await expect(ask(architecture, { ...node, itemId: 'a9' })).rejects.toThrow("There's no item a9 to ask about.");
    await expect(ask(questions, node)).rejects.toThrow('Pins start an item of the same plumbing type.');
    await expect(ask(architecture, { ...node, kind: 'step' })).rejects.toThrow("Architecture items can't take a step pin.");
    await expect(ask(questions, { itemId: 'q1', kind: 'node', ref: 'x', label: 'x' })).rejects.toThrow("Questions items can't take a node pin.");
    await expect(ask(architecture, { ...node, ref: 'ghost' })).rejects.toThrow('There\'s no box "ghost" in "System view".');
    await expect(ask(architecture, { ...node, itemId: 'a2' })).rejects.toThrow('"Old view" has no diagram to ask about.');
    await expect(ask(flows, { itemId: 'f1', kind: 'step', ref: '7', label: 'Step 7' })).rejects.toThrow('There\'s no step 7 in "Turning reminders on".');
    await expect(ask(flows, { itemId: 'f1', kind: 'step', ref: 'one', label: 'Step one' })).rejects.toThrow('There\'s no step one in "Turning reminders on".');
    expect((await readItems(dir)).values).toHaveLength(5);
  });
});
