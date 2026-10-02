import { describe, expect, it } from 'vitest';
import { dataChangeSummary } from '../src/dataDiff';
import type { DiagramData, FlowData, MockupData, PhaseData, TableDiff } from '../src/schemas';

const diagram: DiagramData = {
  kind: 'system',
  groups: [{ id: 'web', label: 'Web app' }, { id: 'jobs', label: 'Jobs' }],
  nodes: [
    { id: 'page', label: 'Account page', group: 'web', status: 'changed', codeRef: { path: 'apps/web/app/account/page.tsx' } },
    { id: 'job', label: 'Daily job', group: 'jobs', status: 'new' },
    { id: 'db', label: 'Subscriptions table', status: 'unchanged' },
  ],
  edges: [
    { id: 'reads', from: 'job', to: 'db', label: 'reads' },
    { id: 'shows', from: 'page', to: 'db' },
  ],
};
const sms = { id: 'sms', label: 'SMS sender', status: 'external' as const };

describe('what a drawing change does, in words', () => {
  it('counts boxes and lines added, removed and changed', () => {
    expect(dataChangeSummary('diagram', diagram, { ...diagram, nodes: [...diagram.nodes, sms], edges: [...diagram.edges, { id: 'sends', from: 'job', to: 'sms' }] })).toEqual([
      '1 box added',
      '1 line added',
    ]);
    const after: DiagramData = {
      kind: 'system',
      groups: [{ id: 'jobs', label: 'Jobs' }],
      nodes: [
        { id: 'job', label: 'Daily reminder job', group: 'jobs', status: 'new' },
        { id: 'db', label: 'Subscriptions table', status: 'unchanged' },
        sms,
        { id: 'email', label: 'Email sender', status: 'external' },
      ],
      edges: [
        { id: 'reads', from: 'job', to: 'db', label: 'reads due subscriptions' },
        { id: 'sends', from: 'job', to: 'sms' },
        { id: 'mails', from: 'job', to: 'email', style: 'dashed' },
      ],
    };
    expect(dataChangeSummary('diagram', diagram, after)).toEqual(['2 boxes added', '1 box removed', '1 box changed', '2 lines added', '1 line removed', '1 line changed', 'groups changed']);
  });

  it("says what changed in a table's fields and migration notes", () => {
    const table: TableDiff = {
      model: 'Subscription',
      change: 'changed',
      fields: [
        { name: 'status', type: 'String', change: 'unchanged' },
        { name: 'remindDays', type: 'Int', change: 'added', default: '3' },
      ],
      schemaDiff: '+  remindDays Int @default(3)',
      migration: [{ kind: 'additive', text: 'Add remindDays with a default of 3.' }],
    };
    const after: TableDiff = {
      ...table,
      fields: [
        { name: 'remindDays', type: 'Int', change: 'added', default: '5' },
        { name: 'pausedAt', type: 'DateTime?', change: 'added' },
      ],
      schemaDiff: '+  remindDays Int @default(5)\n+  pausedAt   DateTime?',
      migration: [{ kind: 'additive', text: 'Add remindDays with a default of 3.' }, { kind: 'rollback', text: 'Drop both columns.' }],
    };
    expect(dataChangeSummary('database', table, after)).toEqual(['field pausedAt added', 'field status removed', 'field remindDays changed', 'migration notes changed']);
    expect(dataChangeSummary('database', table, { ...table, schemaDiff: '+  remindDays Int @default(3) // days before' })).toEqual(['schema diff changed']);
    expect(dataChangeSummary('database', table, { ...table, model: 'Plan', change: 'removed' })).toEqual(['model renamed to Plan', 'marked as removed']);
  });

  it('says which mockup was added, removed or redrawn', () => {
    const mockup: MockupData = { location: { app: 'web', route: '/account', files: ['apps/web/app/account/page.tsx'] }, kit: 'web', after: '<div class="p-4">Restock soon</div>' };
    const withBefore: MockupData = { ...mockup, before: '<div class="p-4">Account</div>' };
    expect(dataChangeSummary('mockups', mockup, { ...mockup, after: '<div class="p-6">Restock soon</div>' })).toEqual(['After mockup redrawn']);
    expect(dataChangeSummary('mockups', mockup, withBefore)).toEqual(['Before mockup added']);
    expect(dataChangeSummary('mockups', withBefore, { ...withBefore, before: '<div class="p-2">Account</div>' })).toEqual(['Before mockup redrawn']);
    expect(dataChangeSummary('mockups', withBefore, mockup)).toEqual(['Before mockup removed']);
    expect(dataChangeSummary('mockups', mockup, { ...mockup, location: { ...mockup.location, route: '/account/reminders' } })).toEqual(['location changed']);
    expect(dataChangeSummary('mockups', mockup, { ...mockup, kit: 'admin' })).toEqual(['kit changed']);
    // A UI item from before Plan 3 has a location and kit but no markup.
    expect(dataChangeSummary('mockups', { location: mockup.location, kit: 'web' }, mockup)).toEqual(['After mockup added']);
  });

  it('names the flow steps that changed', () => {
    const flow: FlowData = {
      kind: 'system',
      lanes: [{ id: 'job', label: 'Daily job', status: 'new' }, { id: 'db', label: 'Database', status: 'unchanged' }],
      steps: [
        { n: 1, from: 'job', to: 'db', label: 'Find subscriptions due soon' },
        { n: 2, from: 'job', to: 'job', label: 'Pick a channel' },
      ],
    };
    const steps = [{ n: 1, from: 'job', to: 'db', label: 'Find subscriptions due in 3 days' }, { n: 3, from: 'job', to: 'db', label: 'Log the send' }];
    expect(dataChangeSummary('flows', flow, { ...flow, steps })).toEqual(['step 3 added', 'step 2 removed', 'step 1 changed']);
    expect(dataChangeSummary('flows', flow, { ...flow, lanes: [...flow.lanes!, { id: 'sms', label: 'SMS provider', status: 'external' }] })).toEqual(['lanes changed']);
    expect(dataChangeSummary('flows', flow, { ...flow, kind: 'both' })).toEqual(['flow kind changed']);
  });

  it('says what changed in a phase', () => {
    const phase: PhaseData = { order: 1, goal: 'Send the first reminders', doneWhen: ['Reminders go out daily'], itemIds: ['architecture-system', 'database-subscription'] };
    const after: PhaseData = { order: 2, goal: 'Send reminders by SMS', doneWhen: ['Reminders go out daily', 'Opt-out works'], itemIds: ['architecture-system', 'database-subscription', 'ui-settings-card'] };
    expect(dataChangeSummary('timeline', phase, after)).toEqual(['now phase 2', 'goal changed', 'done-when changed', 'items changed']);
  });

  it('falls back when a drawing is new, unreadable or only differs in details', () => {
    expect(dataChangeSummary('diagram', diagram, diagram)).toEqual([]);
    expect(dataChangeSummary('diagram', undefined, diagram)).toEqual(['drawing added']);
    expect(dataChangeSummary('timeline', null, { order: 1, goal: 'Ship', doneWhen: ['It ships'], itemIds: [] })).toEqual(['drawing added']);
    expect(dataChangeSummary('diagram', { nodes: 'boxes' }, diagram)).toEqual(['drawing replaced']);
    expect(dataChangeSummary('diagram', diagram, { nodes: [] })).toEqual(['drawing replaced']);
    expect(dataChangeSummary('diagram', diagram, { ...diagram, kind: 'data_flow' })).toEqual(['details changed']);
  });
});
