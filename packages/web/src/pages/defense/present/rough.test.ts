// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { BoardShape } from './boardLayout';
import { roughMarker, roughShape, seedOf } from './rough';

const box: BoardShape = { ref: 'node:job', kind: 'box', x: 10, y: 20, w: 140, h: 36, label: 'Reminder job', dashed: false };
const line: BoardShape = { ref: 'edge:sends', kind: 'line', points: [{ x: 0, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 40 }], arrow: true, dashed: false, ends: [] };

describe('seedOf', () => {
  it('gives each ref its own seed, the same every time, from 1 to 2^31 - 1', () => {
    expect(seedOf('node:job')).toBe(seedOf('node:job'));
    expect(seedOf('node:job')).not.toBe(seedOf('node:sms'));
    for (const ref of ['', 'node:job', 'link:RestockReminder.subscription', 'x'.repeat(200)]) {
      expect(Number.isInteger(seedOf(ref))).toBe(true);
      expect(seedOf(ref)).toBeGreaterThanOrEqual(1);
      expect(seedOf(ref)).toBeLessThanOrEqual(2 ** 31 - 1);
    }
  });
});

describe('roughShape', () => {
  it('draws the same shape the same way every time, and another ref differently', () => {
    const [a] = roughShape(box, 'var(--text)');
    expect(a!.d).toMatch(/^M/);
    expect(roughShape(box, 'var(--text)')).toEqual(roughShape(box, 'var(--text)'));
    expect(roughShape({ ...box, ref: 'node:sms' }, 'var(--text)')[0]!.d).not.toBe(a!.d);
  });

  it('passes the stroke through, with a width for each kind of shape', () => {
    expect(roughShape(box, 'var(--slate)').map((p) => [p.stroke, p.strokeWidth])).toEqual([['var(--slate)', 1.5]]);
    const group: BoardShape = { ref: 'group:jobs', kind: 'group', x: 0, y: 0, w: 300, h: 120, label: 'Jobs', members: [] };
    expect(roughShape(group, 'var(--text)').map((p) => [p.stroke, p.strokeWidth])).toEqual([['var(--text)', 1]]);
  });

  it('draws a line through its points with a two-stroke arrowhead, and nothing for a line without points', () => {
    expect(roughShape(line, 'var(--text)').map((p) => p.strokeWidth)).toEqual([1.3, 1.3, 1.3]);
    expect(roughShape({ ...line, arrow: false }, 'var(--text)')).toHaveLength(1);
    expect(roughShape({ ...line, points: [] }, 'var(--text)')).toEqual([]);
  });
});

describe('roughMarker', () => {
  it("rings a part in the note's ink, the same way for the same note", () => {
    const ring = roughMarker({ x: 10, y: 20, w: 140, h: 36 }, 'note:1.0', 'var(--seal)');
    expect(ring).toHaveLength(1);
    expect(ring[0]!.stroke).toBe('var(--seal)');
    expect(roughMarker({ x: 10, y: 20, w: 140, h: 36 }, 'note:1.0', 'var(--seal)')).toEqual(ring);
  });
});
