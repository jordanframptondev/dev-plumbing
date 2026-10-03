import { expect, test, type Page } from '@playwright/test';
import { importProject, type TestItem } from './claude';
import { noSideScroll, readJson, writeJson } from './env';

// Checked against the fixture repo's packages/db/prisma/schema.prisma (Customer, Subscription, Order, SubscriptionStatus).
const reminder: TestItem = {
  key: 'restock-reminder',
  title: 'Add a RestockReminder table',
  summary: 'One row per reminder sent.',
  data: {
    model: 'RestockReminder',
    change: 'new',
    fields: [
      { name: 'id', type: 'String', change: 'added', default: 'cuid()' },
      { name: 'subscriptionId', type: 'String', change: 'added' },
      { name: 'subscription', type: 'Subscription', change: 'added', note: 'The subscription it reminds about.' },
      { name: 'channel', type: 'String', change: 'added', note: 'sms or email' },
      { name: 'sentAt', type: 'DateTime', change: 'added', default: 'now()' },
    ],
    schemaDiff: [
      '+model RestockReminder {',
      '+  id             String       @id @default(cuid())',
      '+  subscriptionId String',
      '+  subscription   Subscription @relation(fields: [subscriptionId], references: [id])',
      '+  channel        String',
      '+  sentAt         DateTime     @default(now())',
      '+}',
    ].join('\n'),
    migration: [{ kind: 'additive', text: 'Create the RestockReminder table.' }],
  },
};
const subscription: TestItem = {
  key: 'subscription',
  title: 'Remember how early to remind',
  summary: 'A lead time per subscription.',
  data: {
    model: 'Subscription',
    change: 'changed',
    fields: [
      { name: 'id', type: 'String', change: 'unchanged' },
      { name: 'customerId', type: 'String', change: 'unchanged' },
      { name: 'customer', type: 'Customer', change: 'unchanged' },
      { name: 'product', type: 'String', change: 'unchanged' },
      { name: 'status', type: 'SubscriptionStatus', change: 'unchanged' },
      { name: 'nextShipAt', type: 'DateTime', change: 'unchanged' },
      { name: 'remindDaysBefore', type: 'Int', change: 'added', default: '5' },
      { name: 'reminders', type: 'RestockReminder[]', change: 'added' },
      { name: 'pausedUntil', type: 'DateTime?', change: 'changed', note: 'Now optional.' },
    ],
    schemaDiff: [' model Subscription {', '+  remindDaysBefore Int               @default(5)', '+  reminders        RestockReminder[]', ' }'].join('\n'),
    migration: [{ kind: 'additive', text: 'Add remindDaysBefore with a default of 5.' }],
  },
};

const card = (page: Page, model: string) => page.locator(`[data-testid=table-card][data-model=${model}]`);

test('draws the relationships, the migration and a card per table, checked against the schema', async ({ page }) => {
  const p = await importProject('database-draws', 'Database draws', { database: [reminder, subscription] });
  await page.goto(`${p.url}/t/database`);

  // Both tables, plus Customer, which Subscription points at. The SubscriptionStatus enum isn't a box.
  const strip = page.getByTestId('relationship-strip');
  await expect(strip.getByTestId('diagram-node')).toHaveCount(3);
  await expect(strip.locator('[data-node=RestockReminder]')).toHaveAttribute('data-status', 'new');
  await expect(strip.locator('[data-node=Subscription]')).toHaveAttribute('data-status', 'changed');
  await expect(strip.locator('[data-node=Customer]')).toHaveAttribute('data-status', 'unchanged');
  await expect(strip.getByTestId('diagram-edge')).toHaveCount(3);

  const migration = page.getByTestId('migration-panel');
  await expect(migration.getByTestId('migration-headline')).toHaveText('Additive only');
  await expect(migration.getByTestId('migration-additive')).toContainText('Create the RestockReminder table.');
  await expect(migration.getByTestId('migration-additive')).toContainText('Add remindDaysBefore with a default of 5.');
  await expect(migration).toContainText('No rollback described');

  await expect(card(page, 'RestockReminder').getByText('New', { exact: true })).toBeVisible();
  await expect(card(page, 'RestockReminder').getByTestId('table-checks')).toContainText(/Checked against .*schema\.prisma/);
  await expect(card(page, 'Subscription').getByText('Changed', { exact: true })).toBeVisible();
  await expect(card(page, 'Subscription').getByTestId('table-checks')).toHaveText("Subscription.pausedUntil isn't in the schema.");
  await expect(card(page, 'Subscription').getByRole('link', { name: 'Open thread' })).toHaveAttribute('href', `${p.url}/th/t-database-subscription`);
});

test('Visual shows changed fields and folds the rest; Prisma shows the schema diff', async ({ page }) => {
  const p = await importProject('database-toggle', 'Database toggle', { database: [subscription] });
  await page.goto(`${p.url}/t/database`);
  const sub = card(page, 'Subscription');
  await expect(sub.getByTestId('field-row')).toHaveCount(3);
  await expect(sub.locator('[data-field=remindDaysBefore]')).toContainText('default 5');
  await expect(sub.locator('[data-field=pausedUntil]')).toHaveAttribute('data-change', 'changed');
  await sub.getByRole('button', { name: /6 unchanged fields/ }).click();
  await expect(sub.getByTestId('field-row')).toHaveCount(9);
  await sub.getByRole('button', { name: /6 unchanged fields/ }).click();
  await expect(sub.getByTestId('field-row')).toHaveCount(3);

  await sub.getByRole('tab', { name: 'Prisma' }).click();
  const diff = sub.getByTestId('schema-diff');
  await expect(diff.getByText(/remindDaysBefore Int/)).toHaveClass(/text-moss/);
  await expect(diff).toContainText(/\+\s+reminders\s+RestockReminder\[\]/);
  await expect(sub.getByTestId('field-row')).toHaveCount(0);
  await sub.getByRole('tab', { name: 'Visual' }).click();
  await expect(sub.getByTestId('field-row')).toHaveCount(3);
});

test('a destructive migration says so and lists its rollback', async ({ page }) => {
  const p = await importProject('database-destructive', 'Database destructive', {
    database: [
      {
        key: 'drop-legacy',
        title: 'Drop the legacy flag',
        summary: 'Remove a column nothing reads.',
        data: {
          model: 'Order',
          change: 'changed',
          fields: [
            { name: 'id', type: 'String', change: 'unchanged' },
            { name: 'legacyFlag', type: 'Boolean', change: 'removed' },
          ],
          schemaDiff: ' model Order {\n-  legacyFlag Boolean @default(false)\n }',
          migration: [
            { kind: 'destructive', text: 'Drop the legacyFlag column.' },
            { kind: 'rollback', text: 'Add legacyFlag back with a default of false.' },
          ],
        },
      },
      { key: 'index', title: 'Index on sentAt', summary: 'Decide once the table exists.' },
    ],
  });
  await page.goto(`${p.url}/t/database`);
  const migration = page.getByTestId('migration-panel');
  await expect(migration.getByTestId('migration-headline')).toHaveText('Destructive');
  await expect(migration.getByTestId('migration-headline')).toHaveClass(/text-seal/);
  await expect(migration.getByTestId('migration-destructive')).toContainText('Drop the legacyFlag column.');
  await expect(migration.getByTestId('migration-rollback')).toContainText('Add legacyFlag back with a default of false.');
  await expect(migration).not.toContainText('No rollback described');
  await expect(page.locator('[data-field=legacyFlag]')).toHaveAttribute('data-change', 'removed');
  await expect(page.getByTestId('table-checks')).toHaveText("Order.legacyFlag isn't in the schema.");
  // One table with no relations: no strip. The item without data is still listed.
  await expect(page.getByTestId('relationship-strip')).toHaveCount(0);
  await expect(page.getByTestId('other-item')).toHaveText([/Index on sentAt/]);
});

test('says Not checked, with the reason, when the repo profile has no schema', async ({ page }) => {
  const p = await importProject('database-unchecked', 'Database unchecked', { database: [reminder] });
  const saved = readJson('repos/acme-app.json');
  writeJson('repos/acme-app.json', { ...saved, schema: undefined });
  try {
    await page.goto(`${p.url}/t/database`);
    await expect(page.getByTestId('table-checks')).toHaveText('Not checked · No schema file is set in the repo profile.');
  } finally {
    writeJson('repos/acme-app.json', saved);
  }
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test('cards stack and nothing scrolls sideways', async ({ page }) => {
    const p = await importProject('database-phone', 'Database phone', { database: [reminder, subscription] });
    await page.goto(`${p.url}/t/database`);
    await expect(page.getByTestId('relationship-strip').getByTestId('diagram-node')).toHaveCount(3);
    const [first, second] = [await card(page, 'RestockReminder').boundingBox(), await card(page, 'Subscription').boundingBox()];
    expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
    expect(await noSideScroll(page)).toEqual([]);
    await card(page, 'RestockReminder').getByRole('tab', { name: 'Prisma' }).click();
    await expect(card(page, 'RestockReminder').getByTestId('schema-diff')).toBeVisible();
    expect(await noSideScroll(page)).toEqual([]);
  });
});
