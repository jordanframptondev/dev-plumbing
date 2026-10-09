// @vitest-environment node
import type { FlowData } from '@dev-plumbing/core/schemas';
import { describe, expect, it } from 'vitest';
import { sequenceLayout } from './sequenceLayout';

const flow: FlowData = {
  kind: 'system',
  lanes: [
    { id: 'job', label: 'Reminder job', status: 'new' },
    { id: 'db', label: 'Database', status: 'unchanged' },
    { id: 'sms', label: 'SMS provider', status: 'external' },
  ],
  steps: [
    { n: 3, from: 'job', to: 'sms', label: 'Send the reminder' },
    { n: 1, from: 'job', to: 'db', label: 'Find subscriptions due soon' },
    { n: 2, from: 'job', to: 'job', label: 'Skip paused customers', systemNote: 'remindersPaused is true' },
    { n: 4, label: 'Wait for tomorrow' },
  ],
};

describe('sequenceLayout', () => {
  // The numbers SequenceView drew before its layout moved here: lanes of 160 with 24 between and 16 each side, lane
  // heads 32 high, and rows of 44 under 68 of headers.
  it('puts each lane in its column, with its head and its lifeline', () => {
    const layout = sequenceLayout(flow);
    expect([layout.width, layout.height]).toEqual([560, 260]);
    expect(layout.lanes).toEqual([
      { id: 'job', label: 'Reminder job', status: 'new', x: 96, headY: 16, headW: 160, headH: 32, lifeTop: 48, lifeBottom: 244 },
      { id: 'db', label: 'Database', status: 'unchanged', x: 280, headY: 16, headW: 160, headH: 32, lifeTop: 48, lifeBottom: 244 },
      { id: 'sms', label: 'SMS provider', status: 'external', x: 464, headY: 16, headW: 160, headH: 32, lifeTop: 48, lifeBottom: 244 },
    ]);
  });

  it('gives each step a row in step order: an arrow between lanes, a loop on one, a note across the width', () => {
    expect(sequenceLayout(flow).steps).toEqual([
      { n: 1, shape: 'arrow', x1: 96, x2: 280, y: 98, top: 68, label: '1. Find subscriptions due soon', labelX: 188, labelY: 86, anchor: 'middle' },
      { n: 2, shape: 'loop', x1: 96, x2: 124, y: 142, top: 112, label: '2. Skip paused customers', labelX: 130, labelY: 146, anchor: 'start' },
      { n: 3, shape: 'arrow', x1: 96, x2: 464, y: 186, top: 156, label: '3. Send the reminder', labelX: 280, labelY: 174, anchor: 'middle' },
      { n: 4, shape: 'note', x1: 16, x2: 544, y: 230, top: 200, label: '4. Wait for tomorrow', labelX: 280, labelY: 230, anchor: 'middle' },
    ]);
  });

  it('runs an arrow right to left, puts a loop on the last lane label to its left, and cuts labels that would not fit', () => {
    const layout = sequenceLayout({
      kind: 'system',
      lanes: flow.lanes,
      steps: [
        { n: 1, from: 'sms', to: 'job', label: 'Delivery receipt' },
        { n: 2, from: 'sms', label: 'Retries on its own' },
        { n: 3, from: 'job', to: 'db', label: 'A label far too long to fit between two lanes next to each other in any drawing' },
      ],
    });
    const [back, loop, long] = layout.steps;
    expect([back!.x1, back!.x2, back!.labelX]).toEqual([464, 96, 280]);
    expect([loop!.shape, loop!.x1, loop!.labelX, loop!.anchor]).toEqual(['loop', 464, 458, 'end']);
    // 320 of room at 6.5 a character: 49 characters, the last an ellipsis.
    expect(long!.label).toHaveLength(49);
    expect(long!.label.endsWith('…')).toBe(true);
    // A lane label is cut to its head.
    expect(sequenceLayout({ kind: 'system', lanes: [{ id: 'a', label: 'A lane with a name much longer than its head', status: 'new' }], steps: [{ n: 1, from: 'a', label: 'x' }] }).lanes[0]!.label).toBe('A lane with a name mu…');
  });

  it('draws one column wide with no lanes, and every step as a note', () => {
    const layout = sequenceLayout({ kind: 'both', steps: [{ n: 1, label: 'Opens the page' }] });
    expect([layout.width, layout.height, layout.lanes]).toEqual([192, 128, []]);
    expect(layout.steps[0]).toMatchObject({ shape: 'note', x1: 16, x2: 176, labelX: 96 });
  });
});
