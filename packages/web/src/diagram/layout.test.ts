// @vitest-environment node
import type { DiagramData } from '@dev-plumbing/core/schemas';
import type { ElkNode } from 'elkjs/lib/elk-api';
import { describe, expect, it } from 'vitest';
import { fromElk, layoutDiagram, toElkGraph, type DiagramLayout } from './layout';

const restock: DiagramData = {
  kind: 'system',
  groups: [
    { id: 'web', label: 'Web app' },
    { id: 'jobs', label: 'Jobs' },
    { id: 'empty', label: 'Nothing here' },
  ],
  nodes: [
    { id: 'page', label: 'Settings page', group: 'web', status: 'new', codeRef: { path: 'apps/web/app/reminders/page.tsx' } },
    { id: 'api', label: 'Account API', group: 'web', status: 'changed' },
    { id: 'job', label: 'Daily reminder job', group: 'jobs', status: 'new' },
    { id: 'sms', label: 'SMS provider with a very long name that will not fit', status: 'external' },
  ],
  edges: [
    { id: 'saves', from: 'page', to: 'api', label: 'saves' },
    { id: 'sends', from: 'job', to: 'sms', style: 'dashed' },
    { id: 'ghost', from: 'job', to: 'nowhere' },
  ],
};

/** 20 boxes in four groups, each linked to the next and to the one four places on. */
function twentyBoxes(): DiagramData {
  const groups = ['web', 'api', 'jobs', 'data'].map((id) => ({ id, label: `The ${id} part` }));
  const statuses = ['new', 'changed', 'unchanged', 'external'] as const;
  const nodes = Array.from({ length: 20 }, (_, i) => ({
    id: `box-${i}`,
    label: `Box number ${i}${i % 3 ? '' : ' with a longer label'}`,
    status: statuses[i % 4]!,
    ...(i < 16 ? { group: groups[i % 4]!.id } : {}),
    ...(i % 2 ? { codeRef: { path: `apps/web/lib/box-${i}.ts` } } : {}),
  }));
  const edges = nodes.flatMap((n, i) => [
    ...(i > 0 ? [{ id: `next-${i}`, from: `box-${i - 1}`, to: n.id, label: 'calls' }] : []),
    ...(i > 3 ? [{ id: `skip-${i}`, from: `box-${i - 4}`, to: n.id }] : []),
  ]);
  return { kind: 'system', groups, nodes, edges };
}

const overlaps = (a: DiagramLayout['nodes'][number], b: DiagramLayout['nodes'][number]) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('toElkGraph', () => {
  it('puts boxes in their groups and every line at the root, with sizes', () => {
    const g = toElkGraph(restock, 'RIGHT');
    expect(g.layoutOptions).toMatchObject({
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.spacing.nodeNode': '24',
      'elk.layered.spacing.nodeNodeBetweenLayers': '48',
    });
    // The empty group is left out; the box without a group sits at the root.
    expect(g.children?.map((c) => c.id)).toEqual(['g:web', 'g:jobs', 'n:sms']);
    const web = g.children![0]!;
    expect(web.layoutOptions).toEqual({ 'elk.padding': '[top=28,left=16,bottom=16,right=16]' });
    expect(web.children?.map((c) => [c.id, c.width, c.height])).toEqual([
      ['n:page', 132, 50],
      ['n:api', 132, 36],
    ]);
    expect(g.children![1]!.children?.map((c) => [c.id, c.width])).toEqual([['n:job', 18 * 7 + 32]]);
    expect(g.children![2]!.width).toBe(240);
    // A line to a box that isn't there is dropped.
    expect(g.edges?.map((e) => [e.id, e.sources, e.targets])).toEqual([
      ['e:saves', ['n:page'], ['n:api']],
      ['e:sends', ['n:job'], ['n:sms']],
    ]);
    expect(g.edges![0]!.labels).toEqual([{ text: 'saves', width: 5 * 6.5 + 8, height: 14 }]);
    expect(g.edges![1]!.labels).toBeUndefined();
    expect(toElkGraph(restock, 'DOWN').layoutOptions?.['elk.direction']).toBe('DOWN');
  });
});

describe('fromElk', () => {
  it('gives absolute positions for boxes in groups, and for lines inside a group', () => {
    const graph: ElkNode = {
      id: 'root',
      width: 640,
      height: 200,
      children: [
        { id: 'g:web', x: 10, y: 20, width: 330, height: 110, children: [
          { id: 'n:api', x: 182, y: 30, width: 132, height: 36 },
          { id: 'n:page', x: 16, y: 28, width: 132, height: 50 },
        ] },
        { id: 'g:jobs', x: 380, y: 20, width: 170, height: 90, children: [{ id: 'n:job', x: 16, y: 28, width: 132, height: 36 }] },
        { id: 'n:sms', x: 400, y: 140, width: 240, height: 36 },
      ],
      edges: [
        {
          id: 'e:saves',
          sources: ['n:page'],
          targets: ['n:api'],
          container: 'g:web',
          sections: [{ id: 's1', startPoint: { x: 148, y: 50 }, endPoint: { x: 182, y: 50 } }],
          labels: [{ text: 'saves', x: 150, y: 34, width: 40, height: 14 }],
        },
        {
          id: 'e:sends',
          sources: ['n:job'],
          targets: ['n:sms'],
          container: 'root',
          sections: [{ id: 's2', startPoint: { x: 462, y: 84 }, bendPoints: [{ x: 462, y: 112 }, { x: 520, y: 112 }], endPoint: { x: 520, y: 140 } }],
        },
      ],
    };
    const layout = fromElk(graph, restock);
    expect(layout.width).toBe(640);
    expect(layout.groups).toEqual([
      { id: 'web', label: 'Web app', x: 10, y: 20, w: 330, h: 110 },
      { id: 'jobs', label: 'Jobs', x: 380, y: 20, w: 170, h: 90 },
    ]);
    expect(layout.nodes.map((n) => [n.id, n.x, n.y, n.status, n.path])).toEqual([
      ['page', 26, 48, 'new', 'apps/web/app/reminders/page.tsx'],
      ['api', 192, 50, 'changed', null],
      ['job', 396, 48, 'new', null],
      ['sms', 400, 140, 'external', null],
    ]);
    const [saves, sends] = layout.edges;
    expect(saves).toEqual({ id: 'saves', points: [{ x: 158, y: 70 }, { x: 192, y: 70 }], label: 'saves', labelX: 180, labelY: 61, dashed: false });
    expect(sends!.points).toEqual([{ x: 462, y: 84 }, { x: 462, y: 112 }, { x: 520, y: 112 }, { x: 520, y: 140 }]);
    // No label from ELK: the middle of the longest segment.
    expect([sends!.labelX, sends!.labelY, sends!.label, sends!.dashed]).toEqual([491, 112, null, true]);
  });
});

describe('layoutDiagram', () => {
  it('lays out 20 boxes inside the drawing, with no two overlapping', async () => {
    for (const direction of ['RIGHT', 'DOWN'] as const) {
      const layout = await layoutDiagram(twentyBoxes(), direction);
      expect(layout.nodes).toHaveLength(20);
      expect(layout.groups).toHaveLength(4);
      for (const n of layout.nodes) {
        expect(n.x).toBeGreaterThanOrEqual(0);
        expect(n.y).toBeGreaterThanOrEqual(0);
        expect(n.x + n.w).toBeLessThanOrEqual(layout.width);
        expect(n.y + n.h).toBeLessThanOrEqual(layout.height);
      }
      for (let i = 0; i < layout.nodes.length; i++) {
        for (let j = i + 1; j < layout.nodes.length; j++) {
          const [a, b] = [layout.nodes[i]!, layout.nodes[j]!];
          expect(overlaps(a, b), `${a.id} overlaps ${b.id} (${direction})`).toBe(false);
        }
      }
      expect(layout.edges).toHaveLength(35);
      for (const e of layout.edges) expect(e.points.length, e.id).toBeGreaterThanOrEqual(2);
      // Boxes sit inside their group.
      const web = layout.groups.find((g) => g.id === 'web')!;
      const box0 = layout.nodes.find((n) => n.id === 'box-0')!;
      expect(box0.x).toBeGreaterThanOrEqual(web.x);
      expect(box0.y).toBeGreaterThanOrEqual(web.y + 28);
      expect(box0.x + box0.w).toBeLessThanOrEqual(web.x + web.w);
    }
  }, 30_000);

  it('runs top to bottom when asked, for narrow screens', async () => {
    const down = await layoutDiagram(twentyBoxes(), 'DOWN');
    const right = await layoutDiagram(twentyBoxes(), 'RIGHT');
    expect(down.height / down.width).toBeGreaterThan(right.height / right.width);
  }, 30_000);
});
