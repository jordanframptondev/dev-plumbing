import { afterAll, describe, expect, it } from 'vitest';
import { CONFLICT_REASON, PLAN_CHANGES_TYPE } from '../src/planChanges';
import type { HistoryEntry, Message, Option } from '../src/schemas';
import { changesSinceFinal, checklistFrom, finalizeChecklist } from '../src/store/checklist';
import { writeHistoryEntry } from '../src/store/io';
import { removeTempDirs } from '../../../testkit/tmp';
import { listType, pair, seedProject, TYPES } from './fixtures';

afterAll(removeTempDirs);

const AT = '2026-10-01T09:00:00.000Z';
const WITH_CHANGE: Option[] = [
  { id: 'email', label: 'Email only', change: { md: [{ find: 'sends a reminder', replace: 'sends an email reminder' }] } },
  { id: 'sms', label: 'SMS too' },
];
const claude = (id: string, extra: Partial<Extract<Message, { author: 'claude' }>> = {}): Message => ({ id, at: AT, author: 'claude', text: 'Which one?', ...extra });
const you = (id: string): Message => ({ id, at: AT, author: 'you', optionId: 'custom', text: 'Email only, please.' });

const edit = (id: string, threadId: string, extra: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id,
  at: AT,
  threadId,
  kind: 'small-edit',
  summary: 'Say UTC',
  change: { md: [{ find: 'daily job', replace: 'daily job (UTC)' }] },
  itemsBefore: {},
  itemsAfter: {},
  ...extra,
});

/** One item for every place on the checklist, and some that belong nowhere. */
function everyKind() {
  return [
    // Reviewed and still open, with nothing that blocks: on no list.
    pair('a-reviewed', { type: 'architecture', title: 'Daily job', messages: [claude('m1'), you('y1')] }),
    pair('q-block', { title: 'Who gets reminders at launch?', fields: { blocking: 'true' } }),
    pair('q-block-done', { title: 'Which channels?', fields: { blocking: 'true' }, status: 'resolved' }),
    pair('q-claude', { title: 'How often?', status: 'with_claude' }),
    pair('q-proposal', { title: 'Reminder copy', messages: [claude('m1', { opening: true }), you('y1'), claude('m2', { options: WITH_CHANGE })] }),
    // The importer's opening options aren't a proposal, so this one just uses its default.
    pair('q-opening', { title: 'Lead time', fields: { default: '5 days' }, options: WITH_CHANGE }),
    pair('q-edit', { title: 'Time zone', status: 'resolved' }),
    pair('q-default', { title: 'Sender address', fields: { default: '  reminders@acme.test ' } }),
    pair('q-parked', { title: 'SMS later?', fields: { blocking: 'true' }, status: 'parked' }),
    pair('c-high', { type: 'concerns', title: 'Duplicate emails', fields: { severity: 'high' }, messages: [claude('m1'), you('y1')] }),
    pair('c-crit', { type: 'concerns', title: 'Unsubscribe link', fields: { severity: 'Critical' } }),
    pair('c-low', { type: 'concerns', title: 'Slow query', fields: { severity: 'low' } }),
  ];
}

const row = (id: string, title: string, typeTitle: string, reason: string) => ({ itemId: id, threadId: `t-${id}`, title, typeTitle, reason });

describe('the finalize checklist', () => {
  it('lists what blocks, what uses a default, what is parked and what nobody reviewed', async () => {
    const dir = await seedProject({ pairs: everyKind() });
    await writeHistoryEntry(dir, edit('c-1', 't-q-edit'));
    await writeHistoryEntry(dir, edit('c-2', 't-a-reviewed', { appliedAt: AT }));
    expect(await finalizeChecklist(dir, TYPES)).toEqual({
      blocking: [
        row('q-claude', 'How often?', 'Questions', 'Claude is working on it.'),
        row('q-proposal', 'Reminder copy', 'Questions', 'A proposal is waiting for your answer.'),
        row('q-edit', 'Time zone', 'Questions', 'A small edit is waiting to be applied.'),
        row('q-block', 'Who gets reminders at launch?', 'Questions', 'Blocking question, not resolved.'),
        row('c-high', 'Duplicate emails', 'Concerns', 'High-severity concern, not resolved.'),
        row('c-crit', 'Unsubscribe link', 'Concerns', 'High-severity concern, not resolved.'),
      ],
      defaults: [
        { ...row('q-opening', 'Lead time', 'Questions', 'No answer yet; the default will be used.'), defaultValue: '5 days' },
        { ...row('q-default', 'Sender address', 'Questions', 'No answer yet; the default will be used.'), defaultValue: 'reminders@acme.test' },
      ],
      parked: [row('q-parked', 'SMS later?', 'Questions', 'Parked.')],
      unreviewed: [row('c-low', 'Slow query', 'Concerns', 'Nobody has answered here.')],
      reviewed: 0,
      canStart: false,
    });
  });

  it('can start once nothing blocks', () => {
    const pairs = [
      pair('q1', { title: 'Who gets reminders?', fields: { blocking: 'true' }, status: 'resolved' }),
      pair('c1', { type: 'concerns', title: 'Duplicate emails', fields: { severity: 'high' }, status: 'parked' }),
      pair('q2', { title: 'Lead time', fields: { default: '5 days' } }),
    ];
    const list = checklistFrom({ items: pairs.map((p) => p.item), threads: pairs.map((p) => p.thread), history: [], types: TYPES });
    expect(list.canStart).toBe(true);
    expect(list.blocking).toEqual([]);
    expect(list.parked.map((e) => e.itemId)).toEqual(['c1']);
    expect(list.defaults.map((e) => e.itemId)).toEqual(['q2']);
  });

  it('reads severity from the field, whatever the type is called, and skips disabled types', () => {
    const risks = listType('risks', { title: 'Risks', order: 7, fields: ['severity'] });
    const hidden = listType('hidden', { title: 'Hidden', order: 8, enabled: false });
    const pairs = [
      pair('r1', { type: 'risks', title: 'Data loss', fields: { severity: 'HIGH ' } }),
      pair('h1', { type: 'hidden', title: 'Old question', fields: { blocking: 'true' } }),
    ];
    const list = checklistFrom({ items: pairs.map((p) => p.item), threads: pairs.map((p) => p.thread), history: [], types: [...TYPES, risks, hidden] });
    expect(list.blocking).toEqual([row('r1', 'Data loss', 'Risks', 'High-severity concern, not resolved.')]);
    expect([...list.defaults, ...list.parked, ...list.unreviewed]).toEqual([]);
  });

  it("blocks on a Plan changes item until it's resolved or parked", () => {
    const conflict = (id: string, title: string, o: Parameters<typeof pair>[1] = {}) => pair(id, { type: 'plan-changes', title, ...o });
    const pairs = [
      conflict('plan-changes-v2-1', 'Approach'),
      conflict('plan-changes-v2-2', 'Data', { status: 'with_claude' }),
      conflict('plan-changes-v2-3', 'Channels', { status: 'resolved' }),
      conflict('plan-changes-v2-4', 'Change 4', { status: 'parked' }),
      // Claude's merged version is a proposal too, but the conflict is the reason given.
      conflict('plan-changes-v2-5', 'Lead time', { messages: [claude('m1'), claude('m2', { options: WITH_CHANGE, recommended: 'email' })] }),
      pair('q1', { title: 'Who gets reminders?', status: 'resolved' }),
    ];
    const types = [PLAN_CHANGES_TYPE, ...TYPES];
    const list = checklistFrom({ items: pairs.map((p) => p.item), threads: pairs.map((p) => p.thread), history: [], types });
    expect(list).toEqual({
      blocking: [
        row('plan-changes-v2-1', 'Approach', 'Plan changes', CONFLICT_REASON),
        row('plan-changes-v2-2', 'Data', 'Plan changes', 'Claude is working on it.'),
        row('plan-changes-v2-5', 'Lead time', 'Plan changes', "Your draft and the repo's new version disagree here."),
      ],
      defaults: [],
      parked: [row('plan-changes-v2-4', 'Change 4', 'Plan changes', 'Parked.')],
      unreviewed: [],
      reviewed: 0,
      canStart: false,
    });
    const settled = pairs.filter((p) => ['resolved', 'parked'].includes(p.thread.status));
    expect(checklistFrom({ items: settled.map((p) => p.item), threads: settled.map((p) => p.thread), history: [], types }).canStart).toBe(true);
  });

  it('says why an item removed from the plan is parked', () => {
    const gone = pair('q-gone', { title: 'SMS opt-in', status: 'parked' });
    const pairs = [{ ...gone, item: { ...gone.item, removedIn: 2 } }, pair('q-later', { title: 'Later', status: 'parked' })];
    const list = checklistFrom({ items: pairs.map((p) => p.item), threads: pairs.map((p) => p.thread), history: [], types: TYPES });
    expect(list.parked).toEqual([
      row('q-later', 'Later', 'Questions', 'Parked.'),
      row('q-gone', 'SMS opt-in', 'Questions', 'Removed from the plan in v2.'),
    ]);
  });

  it('leaves an item marked as reviewed off the unreviewed list, and counts it', () => {
    const marked = (p: ReturnType<typeof pair>) => ({ ...p, item: { ...p.item, reviewedAt: AT } });
    const pairs = [
      marked(pair('c-low', { type: 'concerns', title: 'Slow query', fields: { severity: 'low' } })),
      marked(pair('c-med', { type: 'concerns', title: 'Big table', fields: { severity: 'medium' } })),
      pair('c-new', { type: 'concerns', title: 'Cold cache', fields: { severity: 'low' } }),
      // Marked, but listed elsewhere or nowhere anyway, so not counted: the mark changes only the unreviewed list.
      marked(pair('q-block', { title: 'Who gets reminders?', fields: { blocking: 'true' } })),
      marked(pair('q-default', { title: 'Sender address', fields: { default: 'reminders@acme.test' } })),
      marked(pair('q-parked', { title: 'SMS later?', status: 'parked' })),
      marked(pair('q-done', { title: 'Which channels?', status: 'resolved' })),
      marked(pair('q-answered', { title: 'Lead time', messages: [claude('m1'), you('y1')] })),
    ];
    const list = checklistFrom({ items: pairs.map((p) => p.item), threads: pairs.map((p) => p.thread), history: [], types: TYPES });
    expect(list.unreviewed).toEqual([row('c-new', 'Cold cache', 'Concerns', 'Nobody has answered here.')]);
    expect(list.reviewed).toBe(2);
    expect(list.blocking.map((e) => e.itemId)).toEqual(['q-block']);
    expect(list.defaults.map((e) => e.itemId)).toEqual(['q-default']);
    expect(list.parked.map((e) => e.itemId)).toEqual(['q-parked']);
  });

  it('counts the changes applied since the last final', () => {
    const final = '2026-10-02T10:00:00.000Z';
    const history = [
      edit('c-1', 't-q1', { appliedAt: '2026-10-02T09:00:00.000Z' }),
      edit('c-2', 't-q1', { appliedAt: '2026-10-02T11:00:00.000Z' }),
      edit('c-3', 't-q1', { kind: 'accept', appliedAt: '2026-10-02T12:00:00.000Z' }),
      edit('c-4', 't-q1', { appliedAt: '2026-10-02T11:00:00.000Z', undoneAt: '2026-10-02T11:30:00.000Z' }),
      edit('c-5', 't-q1'),
    ];
    expect(changesSinceFinal(history, final)).toBe(2);
    expect(changesSinceFinal(history, undefined)).toBe(0);
  });
});
