import fs from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic, writeJsonAtomic } from './atomic';
import type { ThreadStatus } from './schemas';

type DemoThread = { id: string; type: string; title: string; summary: string; status: ThreadStatus; blocking?: boolean; claude?: string; you?: string; draft?: string };
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
      { id: 'db1', type: 'database', title: 'One row per send, or per subscription?', summary: 'How often a RestockReminder row is written.', status: 'your_turn', claude: 'Per send keeps history for support. Per subscription is simpler.' },
      { id: 'ui1', type: 'ui', title: 'Reminder settings card', summary: 'A new card on the account settings page.', status: 'your_turn', claude: 'Should the toggle sit above or below the schedule?', draft: 'Put it above the schedule.' },
      { id: 'c1', type: 'concerns', title: 'Rate-limit reminder sends', summary: 'Stop a burst of sends if the job runs twice.', status: 'with_claude', claude: 'A second run on the same day could send twice.', you: 'What stops that?' },
      { id: 'q2', type: 'questions', title: 'Which channels?', summary: 'SMS, email or both.', status: 'resolved', claude: 'SMS, email or both?', you: 'Both.' },
      { id: 'i1', type: 'ideas', title: 'Snooze a reminder by 2 days', summary: 'Let customers push a reminder back.', status: 'parked', claude: 'Customers could snooze a reminder for two days.' },
      { id: 'a1', type: 'architecture', title: 'System view', summary: 'Daily job, notifications and the orders table.', status: 'idle' },
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
      { id: 'f', type: 'flows', title: 'Payment step order', summary: 'Address before payment.', status: 'resolved', claude: 'Address first, then payment?', you: 'Yes.' },
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
        id: itemId, type: t.type, title: t.title, summary: t.summary, fields: t.blocking ? { blocking: 'true' } : {}, threadId, createdBy: 'import',
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
