import { describe, expect, it } from 'vitest';
import { anchorsOn, bubblesFrom, splitRows, toneOf } from './rows';
import { row } from './testkit';

const diagram = { kind: 'system', groups: [], nodes: [{ id: 'job', label: 'Reminder job', status: 'new' }], edges: [] };

describe('splitRows', () => {
  it('sorts rows into drawn, broken, anchored and other, keeping row order', () => {
    const rows = [
      row({ id: 'a', data: diagram }),
      row({ id: 'b', data: { kind: 'system', nodes: 'oops' } }),
      row({ id: 'c', anchor: { itemId: 'a', kind: 'node', ref: 'job', label: 'Reminder job' } }),
      row({ id: 'd' }),
    ];
    const s = splitRows('diagram', rows);
    expect(s.shown.map((x) => [x.row.id, x.ok])).toEqual([
      ['a', true],
      ['b', false],
    ]);
    const broken = s.shown[1]!;
    expect(broken.ok ? [] : broken.problems.length).toBeGreaterThan(0);
    expect(s.anchored.map((r) => r.id)).toEqual(['c']);
    expect(s.other.map((r) => r.id)).toEqual(['d']);
  });
});

describe('bubbles', () => {
  it('counts threads per part, in the most urgent status colour', () => {
    const on = (id: string, ref: string, status: 'your_turn' | 'with_claude' | 'resolved' | 'parked') =>
      row({ id, status, anchor: { itemId: 'a', kind: 'node', ref, label: ref } });
    const anchored = [on('1', 'job', 'resolved'), on('2', 'job', 'your_turn'), on('3', 'api', 'with_claude'), on('4', 'db', 'parked'), row({ id: '5', anchor: { itemId: 'other', kind: 'node', ref: 'job', label: 'x' } })];
    expect(bubblesFrom(anchorsOn(anchored, 'a', 'node'))).toEqual({
      job: { count: 2, tone: 'seal' },
      api: { count: 1, tone: 'slate' },
      db: { count: 1, tone: 'mist' },
    });
    expect(toneOf(['resolved', 'parked'])).toBe('moss');
    expect(toneOf(['draft'])).toBe('slate');
  });
});
