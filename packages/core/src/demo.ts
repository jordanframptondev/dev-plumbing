import fs from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic, writeJsonAtomic } from './atomic';
import type { ThreadStatus } from './schemas';

type DemoThread = { id: string; type: string; title: string; summary: string; status: ThreadStatus; blocking?: boolean; claude?: string; you?: string; draft?: string; data?: unknown };
type DemoProject = {
  repo: string;
  id: string;
  title: string;
  status: 'active' | 'finalized';
  ageMinutes: number;
  sourcePath: string;
  threads: DemoThread[];
  emptyTypes: { type: string; reason: string }[];
  original: string;
  draft: string;
  final?: string;
};

const DAY = 24 * 60;

// The demo's drawings, in the shapes of core/src/schemas/data.ts. The demo has no clone, so its table says "Not checked".
const SYSTEM_VIEW = {
  kind: 'system',
  groups: [
    { id: 'web', label: 'Web app' },
    { id: 'jobs', label: 'Jobs' },
    { id: 'data', label: 'Database' },
  ],
  nodes: [
    { id: 'settings', label: 'Reminder settings card', group: 'web', status: 'new' },
    { id: 'reorder', label: 'Reorder link', group: 'web', status: 'new' },
    { id: 'job', label: 'Daily reminder job', group: 'jobs', status: 'new' },
    { id: 'notify', label: 'Notification sender', group: 'jobs', status: 'changed' },
    { id: 'subscriptions', label: 'Subscription', group: 'data', status: 'changed' },
    { id: 'reminders', label: 'RestockReminder', group: 'data', status: 'new' },
    { id: 'orders', label: 'Order', group: 'data', status: 'unchanged' },
    { id: 'sms', label: 'SMS provider', status: 'external' },
    { id: 'email', label: 'Email provider', status: 'external' },
  ],
  edges: [
    { id: 'saves', from: 'settings', to: 'subscriptions', label: 'saves lead time' },
    { id: 'finds', from: 'job', to: 'subscriptions', label: 'finds due' },
    { id: 'logs', from: 'job', to: 'reminders', label: 'logs' },
    { id: 'hands-off', from: 'job', to: 'notify' },
    { id: 'texts', from: 'notify', to: 'sms', style: 'dashed' },
    { id: 'emails', from: 'notify', to: 'email', style: 'dashed' },
    { id: 'reorders', from: 'reorder', to: 'orders', label: 'creates' },
  ],
};

const REMINDER_TABLE = {
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
    '+',
    '+  @@index([subscriptionId])',
    '+}',
  ].join('\n'),
  migration: [
    { kind: 'additive', text: 'Create the RestockReminder table and its index.' },
    { kind: 'rollback', text: 'Drop the RestockReminder table. Nothing else depends on it.' },
  ],
};

const ACCOUNT_TODAY = `<main class="mx-auto max-w-2xl p-6">
  <h1 class="text-2xl font-semibold">Account</h1>
  <section class="mt-6 rounded-xl border p-5">
    <h2 class="font-medium">Delivery address</h2>
    <p class="mt-1 text-sm opacity-70">12 Harbour Road, Acmeville</p>
  </section>
</main>`;

const ACCOUNT_WITH_REMINDERS = `<main class="mx-auto max-w-2xl p-6">
  <h1 class="text-2xl font-semibold">Account</h1>
  <section class="mt-6 rounded-xl border p-5">
    <h2 class="font-medium">Delivery address</h2>
    <p class="mt-1 text-sm opacity-70">12 Harbour Road, Acmeville</p>
  </section>
  <section class="mt-4 rounded-xl border p-5">
    <div class="flex items-center justify-between">
      <h2 class="font-medium">Restock reminders</h2>
      <span class="rounded-full border px-3 py-1 text-xs">On</span>
    </div>
    <p class="mt-1 text-sm opacity-70">We'll remind you before an item runs out.</p>
    <label class="mt-4 flex items-center gap-2 text-sm">Remind me
      <select class="rounded border px-2 py-1"><option>5 days</option><option>3 days</option></select>
      before
    </label>
  </section>
</main>`;

const SETTINGS_MOCKUP = {
  location: { app: 'web', route: '/account', files: ['apps/web/app/account/page.tsx'] },
  kit: 'web',
  after: ACCOUNT_WITH_REMINDERS,
  before: ACCOUNT_TODAY,
};

const PAYMENT_FLOW = {
  kind: 'both',
  lanes: [
    { id: 'shopper', label: 'Shopper', status: 'unchanged' },
    { id: 'checkout', label: 'Checkout page', status: 'changed' },
    { id: 'orders', label: 'Orders API', status: 'unchanged' },
    { id: 'payments', label: 'Payment provider', status: 'external' },
  ],
  steps: [
    { n: 1, from: 'shopper', to: 'checkout', label: 'Enters the delivery address' },
    { n: 2, from: 'checkout', to: 'orders', label: 'Saves the address', systemNote: 'The order is created as a draft.' },
    { n: 3, from: 'shopper', to: 'checkout', label: 'Enters card details' },
    { n: 4, from: 'checkout', to: 'payments', label: 'Confirms the payment' },
    { n: 5, from: 'orders', to: 'orders', label: 'Marks the order paid', systemNote: 'When the payment webhook arrives.' },
  ],
};

const projects: DemoProject[] = [
  {
    repo: 'acme',
    id: 'restock-reminders',
    title: 'Restock reminders',
    status: 'active',
    ageMinutes: 2,
    sourcePath: 'docs/specs/restock-reminders.md',
    emptyTypes: [{ type: 'security', reason: "The plan doesn't touch roles, permissions or personal data." }],
    original: '# Restock reminders\n\nRemind customers before a subscription item runs out, and let them reorder in one tap.\n\n## Approach\n\nA daily job finds subscriptions due in the next few days and sends a reminder.\n',
    draft: '# Restock reminders\n\nRemind customers before a subscription item runs out, and let them reorder in one tap.\n\n## Approach\n\nA daily job finds subscriptions due in the next few days and sends a reminder.\n\nReminders go out by SMS and email.\n',
    threads: [
      { id: 'q1', type: 'questions', title: 'Who gets reminders at launch?', summary: 'Everyone, or only active subscribers?', status: 'your_turn', blocking: true, claude: "I'd start with active subscribers only: a smaller blast radius." },
      { id: 'db1', type: 'database', title: 'One row per send, or per subscription?', summary: 'How often a RestockReminder row is written.', status: 'your_turn', claude: 'Per send keeps history for support. Per subscription is simpler.', data: REMINDER_TABLE },
      { id: 'ui1', type: 'ui', title: 'Reminder settings card', summary: 'A new card on the account settings page.', status: 'your_turn', claude: 'Should the toggle sit above or below the schedule?', draft: 'Put it above the schedule.', data: SETTINGS_MOCKUP },
      { id: 'c1', type: 'concerns', title: 'Rate-limit reminder sends', summary: 'Stop a burst of sends if the job runs twice.', status: 'with_claude', claude: 'A second run on the same day could send twice.', you: 'What stops that?' },
      { id: 'q2', type: 'questions', title: 'Which channels?', summary: 'SMS, email or both.', status: 'resolved', claude: 'SMS, email or both?', you: 'Both.' },
      { id: 'i1', type: 'ideas', title: 'Snooze a reminder by 2 days', summary: 'Let customers push a reminder back.', status: 'parked', claude: 'Customers could snooze a reminder for two days.' },
      { id: 'a1', type: 'architecture', title: 'System view', summary: 'Daily job, notifications and the orders table.', status: 'idle', data: SYSTEM_VIEW },
      { id: 'p1', type: 'phases', title: 'Send the first reminders', summary: 'The daily job, its table and the sends.', status: 'idle', data: { order: 1, goal: 'Reminders go out by SMS and email before an item runs out.', doneWhen: ['The daily job runs in production', 'Support can see every reminder sent'], itemIds: ['item-a1', 'item-db1'] } },
      { id: 'p2', type: 'phases', title: 'Reorder in one tap', summary: 'The settings card and the reorder link.', status: 'idle', data: { order: 2, goal: 'Customers turn reminders on and reorder from them in one tap.', doneWhen: ['The settings card is live', 'Each reminder links straight to reorder'], itemIds: ['item-ui1'] } },
    ],
  },
  {
    repo: 'acme',
    id: 'onboarding-emails',
    title: 'Onboarding emails',
    status: 'finalized',
    ageMinutes: 21 * DAY,
    sourcePath: 'docs/specs/onboarding-emails.md',
    emptyTypes: [],
    original: '# Onboarding emails\n\nA short series of emails for new customers.\n',
    draft: '# Onboarding emails\n\nA series of three emails for new customers.\n',
    final: '# Onboarding emails\n\n## 1. Title and summary\n\nA series of three emails for new customers.\n',
    threads: [
      { id: 'q', type: 'questions', title: 'How many emails in the series?', summary: 'Length of the series.', status: 'resolved', claude: 'Three or five?', you: 'Three.' },
      { id: 'db', type: 'database', title: 'Track which email was sent', summary: 'A sent-at column per email.', status: 'resolved', claude: 'Add sentAt per email?', you: 'Yes.' },
      { id: 'ui', type: 'ui', title: 'Welcome email layout', summary: 'The first email in the series.', status: 'resolved', claude: 'One column or two?', you: 'One.' },
    ],
  },
  {
    repo: 'beta',
    id: 'checkout-redesign',
    title: 'Checkout redesign',
    status: 'active',
    ageMinutes: 4 * DAY,
    sourcePath: 'docs/plans/checkout-redesign.md',
    emptyTypes: [],
    original: '# Checkout redesign\n\nA shorter checkout with fewer steps.\n',
    draft: '# Checkout redesign\n\nA shorter checkout with fewer steps.\n',
    threads: [
      { id: 'q', type: 'questions', title: 'Keep guest checkout?', summary: 'Guest checkout or accounts only.', status: 'your_turn', blocking: true, claude: 'Guest checkout lifts conversion but complicates order history.' },
      { id: 'c', type: 'concerns', title: 'Card form accessibility', summary: 'Screen reader labels on the card form.', status: 'your_turn', claude: 'The new card form has no visible labels.' },
      { id: 'f', type: 'flows', title: 'Payment step order', summary: 'Address before payment.', status: 'resolved', claude: 'Address first, then payment?', you: 'Yes.', data: PAYMENT_FLOW },
    ],
  },
];

/** Adds three example plumbing projects under root. Skips any that already exist. Returns the folders it created. */
export async function writeDemoProjects(root: string, now: Date = new Date()): Promise<string[]> {
  const created: string[] = [];
  const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();
  for (const p of projects) {
    const dir = path.join(root, p.repo, p.id);
    if (await fs.access(dir).then(() => true, () => false)) continue;
    const updatedAt = at(p.ageMinutes);
    await writeFileAtomic(path.join(dir, 'docs', 'original.md'), p.original);
    await writeFileAtomic(path.join(dir, 'docs', 'draft.md'), p.draft);
    if (p.final) await writeFileAtomic(path.join(dir, 'docs', 'final.md'), p.final);
    for (const t of p.threads) {
      const itemId = `item-${t.id}`;
      const threadId = `thread-${t.id}`;
      await writeJsonAtomic(path.join(dir, 'items', `${itemId}.json`), {
        id: itemId, type: t.type, title: t.title, summary: t.summary, fields: t.blocking ? { blocking: 'true' } : {}, ...(t.data !== undefined ? { data: t.data } : {}), threadId, createdBy: 'import',
      });
      const messages: { id: string; at: string; author: 'claude' | 'you'; text: string }[] = [];
      if (t.claude) messages.push({ id: `${t.id}-1`, at: at(p.ageMinutes + 60), author: 'claude', text: t.claude });
      if (t.you) messages.push({ id: `${t.id}-2`, at: at(p.ageMinutes + 30), author: 'you', text: t.you });
      await writeJsonAtomic(path.join(dir, 'threads', `${threadId}.json`), {
        id: threadId, itemId, status: t.status, ...(t.draft ? { draft: { note: t.draft, updatedAt } } : {}), messages,
      });
    }
    await writeJsonAtomic(path.join(dir, 'project.json'), {
      id: p.id,
      repo: p.repo,
      title: p.title,
      source: { path: p.sourcePath, clone: `~/Source/${p.repo}`, branch: 'main', hashAtImport: 'demo' },
      docs: {
        original: 'docs/original.md',
        draft: 'docs/draft.md',
        ...(p.final ? { final: 'docs/final.md', exportedTo: { clone: `~/Source/${p.repo}`, path: p.sourcePath.replace(/\.md$/, '.final.md'), at: updatedAt } } : {}),
      },
      status: p.status,
      emptyTypes: p.emptyTypes,
      createdAt: at(p.ageMinutes + 600),
      updatedAt,
    });
    created.push(dir);
  }
  return created;
}
