import fs from 'node:fs/promises';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { repoProfileSchema, type TableDiff } from '../src/schemas';
import { createDataChecker } from '../src/store/checks';
import { removeTempDirs, tempDir } from '../../../testkit/tmp';

afterAll(removeTempDirs);

const SCHEMA_PATH = 'packages/db/prisma/schema.prisma';
const SCHEMA = `model Customer {
  id            String         @id @default(cuid())
  email         String         @unique
  subscriptions Subscription[]
}

model Subscription {
  id         String             @id @default(cuid())
  customer   Customer           @relation(fields: [customerId], references: [id])
  customerId String
  status     SubscriptionStatus @default(ACTIVE)
  note       String?
}

enum SubscriptionStatus {
  ACTIVE
  PAUSED
}
`;

const profile = (schema?: { type: 'prisma' | 'sql' | 'other'; path: string }) =>
  repoProfileSchema.parse({ name: 'acme', match: ['github.com/acme/acme'], ...(schema ? { schema } : {}) });
const prisma = profile({ type: 'prisma', path: SCHEMA_PATH });

/** A clone with the Acme schema and one page, and a second schema file just outside the clone. */
async function makeClone(): Promise<{ clone: string; outside: string }> {
  const root = tempDir('dp-checks-');
  const clone = path.join(root, 'clone');
  await fs.mkdir(path.join(clone, 'packages', 'db', 'prisma'), { recursive: true });
  await fs.writeFile(path.join(clone, SCHEMA_PATH), SCHEMA);
  await fs.mkdir(path.join(clone, 'apps', 'web', 'app', 'account'), { recursive: true });
  await fs.writeFile(path.join(clone, 'apps', 'web', 'app', 'account', 'page.tsx'), 'export default function AccountPage() {}\n');
  const outside = path.join(root, 'outside', 'schema.prisma');
  await fs.mkdir(path.dirname(outside), { recursive: true });
  await fs.writeFile(outside, 'model Invoice {\n  id String\n}\n');
  return { clone, outside };
}

const table = (t: Partial<TableDiff> & Pick<TableDiff, 'model' | 'change'>): TableDiff => ({ fields: [], schemaDiff: '', ...t });

describe('checking tables against the Prisma schema', () => {
  it('warns where a table disagrees with the schema in the clone', async () => {
    const { clone } = await makeClone();
    const checker = createDataChecker({ clone, profile: prisma });
    const warnings = async (t: TableDiff) => {
      const r = await checker.check('database', t);
      return r?.kind === 'database' ? r.warnings : r;
    };
    expect(await checker.check('database', table({ model: 'RestockReminder', change: 'new', fields: [{ name: 'id', type: 'String', change: 'added' }] }))).toEqual({
      kind: 'database',
      checked: true,
      file: SCHEMA_PATH,
      warnings: [],
    });
    expect(await warnings(table({ model: 'Customer', change: 'new' }))).toEqual(["There's already a model called Customer in the schema."]);
    expect(await warnings(table({ model: 'Invoice', change: 'changed' }))).toEqual(["There's no model called Invoice in the schema."]);
    expect(await warnings(table({ model: 'Invoice', change: 'removed' }))).toEqual(["There's no model called Invoice in the schema."]);
    const subscription = table({
      model: 'Subscription',
      change: 'changed',
      fields: [
        { name: 'id', type: 'String', change: 'unchanged' },
        { name: 'customerId', type: 'String', change: 'added' },
        { name: 'reminderLeadDays', type: 'Int', change: 'added', default: '5' },
        { name: 'pausedAt', type: 'DateTime?', change: 'changed' },
        { name: 'legacyFlag', type: 'Boolean', change: 'removed' },
        { name: 'status', type: 'String', change: 'unchanged' },
        { name: 'note', type: 'String?  ', change: 'unchanged' },
        { name: 'ghost', type: 'String', change: 'unchanged' },
      ],
    });
    expect(await warnings(subscription)).toEqual([
      'Subscription.customerId is added but already in the schema.',
      "Subscription.pausedAt isn't in the schema.",
      "Subscription.legacyFlag isn't in the schema.",
      'Subscription.status is SubscriptionStatus in the schema, not String.',
      "Subscription.ghost isn't in the schema.",
    ]);
  });

  it("says why a table wasn't checked", async () => {
    const { clone, outside } = await makeClone();
    const t = table({ model: 'Customer', change: 'changed' });
    const reason = async (o: Parameters<typeof createDataChecker>[0]) => {
      const r = await createDataChecker(o).check('database', t);
      return r?.kind === 'database' && !r.checked ? r.reason : r;
    };
    expect(await reason({ clone, profile: undefined })).toBe('No schema file is set in the repo profile.');
    expect(await reason({ clone, profile: profile() })).toBe('No schema file is set in the repo profile.');
    expect(await reason({ clone, profile: profile({ type: 'sql', path: 'db/schema.sql' }) })).toBe("The repo profile's schema isn't Prisma, so it isn't checked.");
    expect(await reason({ clone: null, profile: prisma })).toBe("The plan's clone isn't on this Mac any more.");
    expect(await reason({ clone, profile: profile({ type: 'prisma', path: 'prisma/schema.prisma' }) })).toBe("The schema file isn't in the clone: prisma/schema.prisma.");
    expect(await reason({ clone, profile: profile({ type: 'prisma', path: '../outside/schema.prisma' }) })).toBe("The schema file isn't in the clone: ../outside/schema.prisma.");
    expect(await reason({ clone, profile: profile({ type: 'prisma', path: outside }) })).toBe(`The schema file isn't in the clone: ${outside}.`);
    await fs.symlink(outside, path.join(clone, 'linked.prisma'));
    expect(await reason({ clone, profile: profile({ type: 'prisma', path: 'linked.prisma' }) })).toBe("The schema file isn't in the clone: linked.prisma.");
  });

  it('reads the schema file once per checker', async () => {
    const { clone } = await makeClone();
    const checker = createDataChecker({ clone, profile: prisma });
    const t = table({ model: 'Customer', change: 'new' });
    expect(await checker.check('database', t)).toMatchObject({ checked: true });
    await fs.rm(path.join(clone, SCHEMA_PATH));
    expect(await checker.check('database', t)).toEqual({ kind: 'database', checked: true, file: SCHEMA_PATH, warnings: ["There's already a model called Customer in the schema."] });
    expect(await createDataChecker({ clone, profile: prisma }).check('database', t)).toMatchObject({ checked: false });
  });
});

describe('checking diagram boxes against the clone', () => {
  const diagram = {
    kind: 'system',
    nodes: [
      { id: 'page', label: 'Account page', status: 'changed', codeRef: { path: 'apps/web/app/account/page.tsx' } },
      { id: 'page-fn', label: 'AccountPage', status: 'changed', codeRef: { path: 'apps/web/app/account/page.tsx', symbol: 'AccountPage' } },
      { id: 'card', label: 'Restock card', status: 'new', codeRef: { path: 'apps/web/app/account/page.tsx', symbol: 'RestockCard' } },
      { id: 'gone', label: 'Old job', status: 'changed', codeRef: { path: 'apps/worker/old-job.ts' } },
      { id: 'email', label: 'Email provider', status: 'external' },
    ],
  };

  it('marks each box whose file reference is found', async () => {
    const { clone } = await makeClone();
    expect(await createDataChecker({ clone, profile: prisma }).check('diagram', diagram)).toEqual({
      kind: 'diagram',
      checked: true,
      nodes: { page: true, 'page-fn': true, card: false, gone: false },
    });
  });

  it("says the boxes weren't checked without a clone", async () => {
    expect(await createDataChecker({ clone: null, profile: prisma }).check('diagram', diagram)).toEqual({
      kind: 'diagram',
      checked: false,
      reason: "The plan's clone isn't on this Mac any more.",
      nodes: {},
    });
  });

  it('checks only diagrams and tables, and only data that parses', async () => {
    const { clone } = await makeClone();
    const checker = createDataChecker({ clone, profile: prisma });
    expect(await checker.check('mockups', { location: { app: 'web' }, kit: 'web' })).toBeNull();
    expect(await checker.check('flows', { kind: 'user', steps: [{ n: 1, label: 'Opens it' }] })).toBeNull();
    expect(await checker.check(null, { anything: true })).toBeNull();
    expect(await checker.check('diagram', { kind: 'system', nodes: [] })).toBeNull();
    expect(await checker.check('database', { model: 'Customer' })).toBeNull();
  });
});
