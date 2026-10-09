// @vitest-environment node
import type { DiagramData, FlowData, PresentStep, TableDiff } from '@dev-plumbing/core/schemas';
import { describe, expect, it } from 'vitest';
import { layoutBoard, shownAt, type BoardShape } from './boardLayout';

const system: DiagramData = {
  kind: 'system',
  groups: [{ id: 'jobs', label: 'Jobs' }],
  nodes: [
    { id: 'page', label: 'Reminders page', status: 'new' },
    { id: 'job', label: 'Reminder job', group: 'jobs', status: 'changed' },
    { id: 'retry', label: 'Retry queue', group: 'jobs', status: 'new' },
    { id: 'sms', label: 'SMS provider', status: 'external' },
  ],
  edges: [
    { id: 'schedules', from: 'page', to: 'job', label: 'schedules' },
    { id: 'sends', from: 'job', to: 'sms', style: 'dashed' },
  ],
};
const reminder: TableDiff = {
  model: 'RestockReminder',
  change: 'new',
  fields: [
    { name: 'id', type: 'String', change: 'added' },
    { name: 'subscriptionId', type: 'String', change: 'added' },
    { name: 'subscription', type: 'Subscription', change: 'added' },
  ],
  schemaDiff: '+model RestockReminder {}',
};
const subscription: TableDiff = { model: 'Subscription', change: 'changed', fields: [{ name: 'leadDays', type: 'Int', change: 'added' }], schemaDiff: '+  leadDays Int' };
const flow: FlowData = {
  kind: 'system',
  lanes: [
    { id: 'job', label: 'Reminder job', status: 'new' },
    { id: 'db', label: 'Database', status: 'unchanged' },
    { id: 'sms', label: 'SMS provider', status: 'external' },
  ],
  steps: [
    { n: 2, from: 'job', to: 'job', label: 'Skip paused customers' },
    { n: 1, from: 'job', to: 'db', label: 'Find subscriptions due soon' },
    { n: 3, label: 'Wait for tomorrow' },
  ],
};

const refs = (shapes: BoardShape[]) => shapes.map((s) => `${s.kind} ${s.ref}`);
const step = (reveal: string[]): PresentStep => ({ caption: 'Say this.', reveal, notes: [] });

describe('layoutBoard', () => {
  it('lays a diagram out with ELK: groups, then lines, then boxes, each by its typed ref', async () => {
    const board = (await layoutBoard({ kind: 'diagram', itemId: 'architecture-system' }, system))!;
    expect(board.tone).toBe('ink');
    expect(refs(board.shapes)).toEqual(['group group:jobs', 'line edge:schedules', 'line edge:sends', 'box node:page', 'box node:job', 'box node:retry', 'box node:sms']);
    const [group, schedules, sends] = board.shapes;
    expect(group).toMatchObject({ label: 'Jobs', members: ['node:job', 'node:retry'] });
    expect(schedules).toMatchObject({ label: 'schedules', arrow: true, dashed: false, ends: ['node:page', 'node:job'] });
    expect(sends).toMatchObject({ arrow: true, dashed: true, ends: ['node:job', 'node:sms'] });
    expect(sends).not.toHaveProperty('label');
    expect(board.shapes.find((s) => s.ref === 'node:sms')).toMatchObject({ kind: 'box', label: 'SMS provider', dashed: true });
    // Absolute positions inside the board.
    for (const s of board.shapes) {
      if (s.kind === 'line') expect(s.points.length).toBeGreaterThanOrEqual(2);
      else {
        expect(s.x + s.w).toBeLessThanOrEqual(board.width);
        expect(s.y + s.h).toBeLessThanOrEqual(board.height);
      }
    }
  }, 30_000);

  it("draws the project's tables as the relationship strip, in slate, skipping data that doesn't parse", async () => {
    const board = (await layoutBoard({ kind: 'tables' }, [reminder, { model: '' }, subscription]))!;
    expect(board.tone).toBe('slate');
    expect(refs(board.shapes)).toEqual(['line link:RestockReminder.subscription', 'box table:RestockReminder', 'box table:Subscription']);
    expect(board.shapes[0]).toMatchObject({ label: 'subscription', ends: ['table:RestockReminder', 'table:Subscription'] });
    // One table still draws.
    expect(refs((await layoutBoard({ kind: 'tables' }, [subscription]))!.shapes)).toEqual(['box table:Subscription']);
  }, 30_000);

  it('draws a system flow as a sequence: each lane its head and lifeline, each step its arrow, loop or note', async () => {
    const board = (await layoutBoard({ kind: 'flow', itemId: 'flows-reminder' }, flow))!;
    expect(refs(board.shapes)).toEqual([
      'line lane:job',
      'box lane:job',
      'line lane:db',
      'box lane:db',
      'line lane:sms',
      'box lane:sms',
      'line step:1',
      'line step:2',
      'line step:3',
    ]);
    expect([board.width, board.height]).toEqual([560, 216]);
    expect(board.shapes[1]).toEqual({ ref: 'lane:job', kind: 'box', x: 16, y: 16, w: 160, h: 32, label: 'Reminder job', dashed: false });
    expect(board.shapes[0]).toMatchObject({ points: [{ x: 96, y: 48 }, { x: 96, y: 200 }], arrow: false, dashed: true, ends: [] });
    expect(board.shapes[5]).toMatchObject({ dashed: true });
    const [arrow, loop, note] = board.shapes.slice(6);
    expect(arrow).toMatchObject({ points: [{ x: 96, y: 98 }, { x: 280, y: 98 }], label: '1. Find subscriptions due soon', arrow: true, ends: ['lane:job', 'lane:db'] });
    expect(loop).toMatchObject({ anchor: 'start', arrow: true, ends: ['lane:job'] });
    expect(loop!.kind === 'line' && loop!.points).toHaveLength(4);
    expect(note).toMatchObject({ points: [], label: '3. Wait for tomorrow', arrow: false, ends: [] });
  });

  it("gives null when there's nothing it can draw", async () => {
    expect(await layoutBoard({ kind: 'diagram', itemId: 'x' }, { kind: 'system', nodes: [] })).toBeNull();
    expect(await layoutBoard({ kind: 'diagram', itemId: 'x' }, null)).toBeNull();
    expect(await layoutBoard({ kind: 'tables' }, [])).toBeNull();
    expect(await layoutBoard({ kind: 'tables' }, reminder)).toBeNull();
    // A user flow is a storyboard, which the board doesn't draw.
    expect(await layoutBoard({ kind: 'flow', itemId: 'x' }, { kind: 'user', steps: [{ n: 1, label: 'Opens the page' }] })).toBeNull();
    expect(await layoutBoard({ kind: 'flow', itemId: 'x' }, { kind: 'system', lanes: [], steps: [{ n: 1, label: 'x' }] })).toBeNull();
  });
});

describe('shownAt', () => {
  it("adds each step's refs to the ones before, with a line's ends and a group once one of its boxes shows", async () => {
    const board = (await layoutBoard({ kind: 'diagram', itemId: 'architecture-system' }, system))!;
    const steps = [step(['node:page']), step(['edge:sends']), step(['group:jobs'])];
    expect([...shownAt(board, steps, 0)]).toEqual(['node:page']);
    expect([...shownAt(board, steps, 1)].sort()).toEqual(['edge:sends', 'group:jobs', 'node:job', 'node:page', 'node:sms']);
    expect(shownAt(board, steps, 2).has('node:retry')).toBe(false);
  }, 30_000);

  it('skips refs the data no longer has, and shows nothing without a board', async () => {
    const board = (await layoutBoard({ kind: 'flow', itemId: 'flows-reminder' }, flow))!;
    const steps = [step(['step:1', 'lane:gone', 'step:9', 'node:job'])];
    expect([...shownAt(board, steps, 0)].sort()).toEqual(['lane:db', 'lane:job', 'step:1']);
    expect(shownAt(null, steps, 0).size).toBe(0);
  });
});
