import { tablesDrawing, type TableDiff } from '@dev-plumbing/core/schemas';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseScreen, migrationHeadline, relationshipStrip, TableCard } from './DatabaseScreen';
import { row } from './testkit';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('@tanstack/react-router', async () => (await import('./testkit')).routerMock(navigate));

afterEach(cleanup);

const reminder: TableDiff = {
  model: 'RestockReminder',
  change: 'new',
  fields: [
    { name: 'id', type: 'String', change: 'added', default: 'cuid()' },
    { name: 'subscriptionId', type: 'String', change: 'added' },
    { name: 'subscription', type: 'Subscription', change: 'added', note: 'The subscription it reminds about.' },
    { name: 'sentAt', type: 'DateTime', change: 'added', default: 'now()' },
  ],
  schemaDiff: '+model RestockReminder {\n+  id String @id @default(cuid())\n+  sentAt DateTime @default(now())\n+}',
  migration: [{ kind: 'additive', text: 'Create the RestockReminder table.' }],
};
const subscription: TableDiff = {
  model: 'Subscription',
  change: 'changed',
  fields: [
    { name: 'id', type: 'String', change: 'unchanged' },
    { name: 'customerId', type: 'String', change: 'unchanged' },
    { name: 'customer', type: 'Customer', change: 'unchanged' },
    { name: 'status', type: 'SubscriptionStatus', change: 'unchanged' },
    { name: 'remindDaysBefore', type: 'Int', change: 'added', default: '5' },
    { name: 'reminders', type: 'RestockReminder[]', change: 'added' },
    { name: 'legacyNote', type: 'String?', change: 'removed' },
  ],
  schemaDiff: ' model Subscription {\n+  remindDaysBefore Int @default(5)\n-  legacyNote String?\n }',
};

describe('the relationship strip', () => {
  // How the tables are drawn is core's tablesDrawing, tested there. The screen leaves out a strip of fewer than two boxes.
  it("is core's tables drawing", () => {
    expect(relationshipStrip([reminder, subscription])).toEqual(tablesDrawing([reminder, subscription]));
  });

  it('is left out with fewer than two boxes', () => {
    expect(relationshipStrip([{ ...reminder, fields: [{ name: 'id', type: 'String', change: 'added' }] }])).toBeNull();
  });
});

describe('the migration headline', () => {
  it('says destructive, data risk, backfill or additive only', () => {
    expect(migrationHeadline(['additive', 'destructive', 'rollback']).text).toBe('Destructive');
    expect(migrationHeadline(['additive', 'data-risk']).text).toBe('Data risk');
    expect(migrationHeadline(['additive', 'backfill'])).toEqual({ text: 'Additive, with a backfill', className: 'text-ochre' });
    expect(migrationHeadline(['additive', 'rollback'])).toEqual({ text: 'Additive only', className: 'text-moss' });
    expect(migrationHeadline([]).text).toBe('Additive only');
  });
});

describe('the migration headline over removals', () => {
  it('never reads all clear over a removed table or field', () => {
    expect(migrationHeadline([], [{ ...reminder, change: 'removed', migration: [] }])).toEqual({ text: 'Destructive', className: 'text-seal' });
    expect(migrationHeadline([], [{ ...subscription, migration: [] }])).toEqual({ text: 'Destructive', className: 'text-seal' });
    expect(migrationHeadline([], [{ ...reminder, migration: [] }]).text).toBe('Additive only');
  });
});

describe('DatabaseScreen with an undrawable table', () => {
  it('says so, still draws the valid table, and builds the migration from it alone', () => {
    const type = { id: 'database', title: 'Database', screen: 'database' } as never;
    const good = row({ id: 'good', threadId: 't-good', title: 'Reminder table', data: reminder });
    const bad = row({ id: 'bad', threadId: 't-bad', title: 'Broken table', data: { model: 42 } });
    render(<DatabaseScreen repo="a" project="p" data={{ type, items: [good, bad] }} />);
    expect(screen.getByText("This item's drawing couldn't be shown")).toBeTruthy();
    expect(screen.getAllByTestId('table-card')).toHaveLength(1);
    const panel = screen.getByTestId('migration-panel');
    expect(within(panel).getByTestId('migration-additive').textContent).toContain('Create the RestockReminder table.');
    expect(within(panel).getByTestId('migration-headline').textContent).toBe('Additive only');
  });
});

describe('TableCard', () => {
  it('shows changed fields, folds unchanged ones, and switches to the Prisma diff', () => {
    render(<TableCard data={subscription} checks={{ kind: 'database', checked: true, file: 'packages/db/prisma/schema.prisma', warnings: [] }} row={row({ title: 'Remind days before', status: 'your_turn' })} repo="acme-app" project="restock" />);
    const card = screen.getByTestId('table-card');
    expect(within(card).getByText('Changed').className).toContain('text-amber');
    expect(within(card).getByRole('link', { name: 'Open thread' }).getAttribute('href')).toBe('/p/acme-app/restock/th/t-architecture-system');
    expect(within(card).getByTestId('table-checks').textContent).toContain('Checked against packages/db/prisma/schema.prisma');
    expect(screen.getAllByTestId('field-row').map((r) => [r.getAttribute('data-field'), r.getAttribute('data-change')])).toEqual([
      ['remindDaysBefore', 'added'],
      ['reminders', 'added'],
      ['legacyNote', 'removed'],
    ]);
    expect(within(card).getByText('default 5')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /4 unchanged fields/ }));
    expect(screen.getAllByTestId('field-row')).toHaveLength(7);

    fireEvent.click(screen.getByRole('tab', { name: 'Prisma' }));
    const diff = screen.getByTestId('schema-diff');
    expect(within(diff).getByText(/^\+ +remindDaysBefore Int/).className).toContain('text-moss');
    expect(within(diff).getByText(/^- +legacyNote/).className).toContain('text-seal');
    expect(screen.queryAllByTestId('field-row')).toHaveLength(0);
  });

  it('shows warnings, or Not checked with the reason', () => {
    const { unmount } = render(<TableCard data={subscription} checks={{ kind: 'database', checked: true, file: 'schema.prisma', warnings: ["Subscription.legacyNote isn't in the schema."] }} repo="a" project="p" />);
    expect(screen.getByTestId('table-checks').className).toContain('text-amber');
    expect(screen.getByText("Subscription.legacyNote isn't in the schema.")).toBeTruthy();
    // Without a row (the thread view) there's no thread link.
    expect(screen.queryByRole('link')).toBeNull();
    unmount();
    render(<TableCard data={reminder} checks={{ kind: 'database', checked: false, reason: 'No schema file is set in the repo profile.', warnings: [] }} repo="a" project="p" />);
    expect(screen.getByTestId('table-checks').textContent).toBe('Not checked · No schema file is set in the repo profile.');
    expect(screen.getByText('New').className).toContain('text-moss');
  });
});
