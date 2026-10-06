import { afterAll, describe, expect, it } from 'vitest';
import { readItem, readSubmission, readThread, writeItem, writeSubmission, writeThread } from '../src/store/io';
import { finishSubmission, finishWindowSubmissions, groupThreads, pendingSubmissions, pickUp, requeueUnfinished } from '../src/store/queue';
import { removeTempDirs } from '../../../testkit/tmp';
import { pair, seedProject } from './fixtures';

afterAll(removeTempDirs);

const AT = '2026-10-01T10:00:00.000Z';
const sentPair = (id: string, links?: string[]) =>
  pair(id, { status: 'with_claude', links, messages: [{ id: `m-${id}`, at: AT, author: 'claude', text: 'Which?' }, { id: `y-${id}`, at: AT, author: 'you', optionId: 'custom', text: `Answer ${id}` }] });
const submission = (id: string, sent: string[], extra = {}) => ({ id, at: AT, scope: 'all' as const, drafts: {}, sent, resolved: [], processedAt: AT, ...extra });

describe('the queue', () => {
  it('queued submissions are picked up oldest first, once', async () => {
    const dir = await seedProject({ pairs: [sentPair('q1'), sentPair('q2')] });
    await writeSubmission(dir, submission('s-2', ['t-q2']));
    await writeSubmission(dir, submission('s-1', ['t-q1']));
    await writeSubmission(dir, submission('s-0', []));
    expect((await pendingSubmissions(dir)).map((s) => s.id)).toEqual(['s-1', 's-2']);
    await pickUp(dir, 's-1', 'w-a');
    await expect(pickUp(dir, 's-1', 'w-b')).rejects.toThrow(/already picked up/);
    expect((await pendingSubmissions(dir)).map((s) => s.id)).toEqual(['s-2']);
  });

  it("gives back threads Claude didn't answer, with your answer restored as a draft", async () => {
    const dir = await seedProject({ pairs: [sentPair('q1'), sentPair('q2')] });
    await writeSubmission(dir, submission('s-1', ['t-q1', 't-q2'], { pickedUpAt: AT, pickedUpBy: 'w-a' }));
    const answered = await readThread(dir, 't-q2');
    await writeThread(dir, { ...answered, status: 'your_turn', messages: [...answered.messages, { id: 'c', at: AT, author: 'claude', text: 'Done.' }] });
    expect(await finishSubmission(dir, 's-1', [])).toEqual({ returned: ['t-q1'] });
    const back = await readThread(dir, 't-q1');
    expect(back.status).toBe('your_turn');
    expect(back.draft).toMatchObject({ optionId: 'custom', text: 'Answer q1' });
    expect(back.messages.at(-1)?.text).toMatch(/didn't get to this one/);
    expect((await readThread(dir, 't-q2')).messages.at(-1)?.text).toBe('Done.');
    expect((await readSubmission(dir, 's-1')).finishedAt).toBeDefined();
    expect(await finishSubmission(dir, 's-1', [])).toEqual({ returned: [] });
  });

  it("parks a thread Claude didn't answer when an update took its item out of the plan meanwhile", async () => {
    const dir = await seedProject({ pairs: [sentPair('q1'), sentPair('q2')] });
    // v2 removed q1's part of the plan while Claude had it, so the re-import flagged it rather than parking it.
    await writeItem(dir, { ...(await readItem(dir, 'q1')), removedIn: 2, flags: [{ reason: 'Removed from the plan in v2.', fromThreadId: 't-q1', at: AT }] });
    await writeSubmission(dir, submission('s-1', ['t-q1', 't-q2'], { pickedUpAt: AT, pickedUpBy: 'w-a' }));
    expect(await finishSubmission(dir, 's-1', [])).toEqual({ returned: ['t-q1', 't-q2'] });
    const parked = await readThread(dir, 't-q1');
    expect(parked.status).toBe('parked');
    // Your answer is kept in the box, for when you unpark it.
    expect(parked.draft).toMatchObject({ optionId: 'custom', text: 'Answer q1' });
    expect(parked.messages.map((m) => m.text)).toEqual(['Which?', 'Answer q1', 'Parked, because it was removed from the plan in v2.']);
    expect((await readItem(dir, 'q1')).removedIn).toBe(2);
    // A thread whose item is still in the plan comes back to you as before.
    expect((await readThread(dir, 't-q2')).status).toBe('your_turn');
  });

  it('flags conflicts the main window found on every thread involved', async () => {
    const dir = await seedProject({ pairs: [pair('q1'), pair('q2')] });
    await writeSubmission(dir, submission('s-1', [], { pickedUpAt: AT, pickedUpBy: 'w-a' }));
    await finishSubmission(dir, 's-1', [{ threads: ['t-q1', 't-q2'], text: 'One says SMS only, the other email only.' }]);
    expect((await readThread(dir, 't-q1')).messages.at(-1)?.text).toMatch(/Might conflict with another answer: One says SMS only/);
    expect((await readItem(dir, 'q2')).flags?.[0]).toMatchObject({ reason: 'One says SMS only, the other email only.', fromThreadId: 't-q1' });
  });

  it('clears the reviewed mark on the items a conflict flags', async () => {
    const marked = (id: string) => {
      const p = pair(id);
      return { ...p, item: { ...p.item, reviewedAt: AT } };
    };
    const dir = await seedProject({ pairs: [marked('q1'), marked('q2'), marked('q3')] });
    await writeSubmission(dir, submission('s-1', [], { pickedUpAt: AT, pickedUpBy: 'w-a' }));
    await finishSubmission(dir, 's-1', [{ threads: ['t-q1', 't-q2'], text: 'One says SMS only, the other email only.' }]);
    for (const id of ['q1', 'q2']) {
      const item = await readItem(dir, id);
      expect(item.flags).toHaveLength(1);
      expect('reviewedAt' in item).toBe(false);
    }
    expect((await readItem(dir, 'q3')).reviewedAt).toBe(AT);
  });

  it('requeues work from windows that went away, and leaves live windows alone', async () => {
    const dir = await seedProject({ pairs: [sentPair('q1'), sentPair('q2'), sentPair('q3')] });
    await writeSubmission(dir, submission('s-dead', ['t-q1', 't-q2'], { pickedUpAt: AT, pickedUpBy: 'w-dead' }));
    await writeSubmission(dir, submission('s-live', ['t-q3'], { pickedUpAt: AT, pickedUpBy: 'w-live' }));
    const q2 = await readThread(dir, 't-q2');
    await writeThread(dir, { ...q2, status: 'your_turn' });
    expect(await requeueUnfinished(dir, (w) => w === 'w-live')).toEqual(['s-dead']);
    const requeued = await readSubmission(dir, 's-dead');
    expect(requeued).toMatchObject({ sent: ['t-q1'] });
    expect(requeued.pickedUpAt).toBeUndefined();
    expect((await readSubmission(dir, 's-live')).pickedUpBy).toBe('w-live');
    expect((await pendingSubmissions(dir)).map((s) => s.id)).toEqual(['s-dead']);
  });

  it("finishes a window's own submissions it never reported back", async () => {
    const dir = await seedProject({ pairs: [sentPair('q1')] });
    await writeSubmission(dir, submission('s-1', ['t-q1'], { pickedUpAt: AT, pickedUpBy: 'w-a' }));
    expect(await finishWindowSubmissions(dir, 'w-b')).toEqual([]);
    expect(await finishWindowSubmissions(dir, 'w-a')).toEqual(['s-1']);
    expect((await readThread(dir, 't-q1')).status).toBe('your_turn');
  });

  it('groups linked threads, keeping their order', async () => {
    const dir = await seedProject({ pairs: [sentPair('q1', ['q3']), sentPair('q2'), sentPair('q3'), sentPair('q4', ['q2'])] });
    const ids = ['t-q1', 't-q2', 't-q3', 't-q4'];
    expect(await groupThreads(dir, ids, true)).toEqual([['t-q1', 't-q3'], ['t-q2', 't-q4']]);
    expect(await groupThreads(dir, ids, false)).toEqual([['t-q1'], ['t-q2'], ['t-q3'], ['t-q4']]);
  });
});
