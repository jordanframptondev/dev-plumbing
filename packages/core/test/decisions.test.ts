import { afterAll, describe, expect, it } from 'vitest';
import { addDecision, relevantDecisions } from '../src/store/decisions';
import { removeTempDirs } from '../../../testkit/tmp';
import { pair, seedProject } from './fixtures';

afterAll(removeTempDirs);

describe('relevant decisions', () => {
  it('sends the decisions made in these threads, or about their items and the items linked to them', async () => {
    // q1 links to c1, and q2 links to q1. q3 and q4 stand alone.
    const dir = await seedProject({ pairs: [pair('q1', { links: ['c1'] }), pair('c1', { type: 'concerns' }), pair('q2', { links: ['q1'] }), pair('q3'), pair('q4')] });
    await addDecision(dir, { text: 'Old answer', threadId: 't-c1', itemIds: ['c1'] });
    await addDecision(dir, { text: 'From this thread', threadId: 't-q1', itemIds: ['q1'] });
    await addDecision(dir, { text: 'About a linked item', threadId: 't-c1', itemIds: ['c1'] });
    await addDecision(dir, { text: 'About an item that links here', threadId: 't-q2', itemIds: ['q2'] });
    await addDecision(dir, { text: 'Elsewhere, but naming this item', threadId: 't-q4', itemIds: ['q4', 'q1'] });
    await addDecision(dir, { text: 'Settled in q3, about q4', threadId: 't-q3', itemIds: ['q4'] });

    expect(await relevantDecisions(dir, ['t-q1'])).toEqual({
      decisions: ['From this thread', 'About a linked item', 'About an item that links here', 'Elsewhere, but naming this item'],
      total: 5,
    });
    // A decision made in the thread counts even when it's about another item.
    expect(await relevantDecisions(dir, ['t-q3'])).toEqual({ decisions: ['Settled in q3, about q4'], total: 5 });
    expect(await relevantDecisions(dir, [])).toEqual({ decisions: [], total: 5 });
  });
});
