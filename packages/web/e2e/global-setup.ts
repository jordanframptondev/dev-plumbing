import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cliPath, E2E_PORT, e2eEnv, marker, setE2eTmp } from './env';

const FIXTURE_FILES: Record<string, string> = {
  'packages/db/prisma/schema.prisma': `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum SubscriptionStatus {
  ACTIVE
  PAUSED
  CANCELLED
}

/// Someone who buys from Acme.
model Customer {
  id            String         @id @default(cuid())
  email         String         @unique
  name          String?
  subscriptions Subscription[]
  orders        Order[]
  createdAt     DateTime       @default(now())
}

model Subscription {
  id         String             @id @default(cuid())
  customerId String
  customer   Customer           @relation(fields: [customerId], references: [id])
  product    String
  status     SubscriptionStatus @default(ACTIVE)
  nextShipAt DateTime
  createdAt  DateTime           @default(now())

  @@index([customerId])
}

model Order {
  id         String   @id @default(cuid())
  customerId String
  customer   Customer @relation(fields: [customerId], references: [id])
  total      Int
  placedAt   DateTime @default(now())
}
`,
  'apps/web/app/globals.css': `@import "tailwindcss";

@theme {
  --color-brand: #0f766e;
  --radius-card: 14px;
}

@layer components {
  .card-title {
    font-weight: 600;
    letter-spacing: -0.01em;
  }
}
`,
  'apps/web/app/reminders/page.tsx': 'export default function RemindersPage() {\n  return null;\n}\n',
  'apps/web/lib/reminders.ts': 'export function sendRestockReminders() {}\n',
};

export default function globalSetup() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dp-e2e-'));
  setE2eTmp(tmp);
  const env = e2eEnv(tmp);
  const cli = (...args: string[]) => execFileSync(process.execPath, [cliPath, ...args], { env, stdio: 'inherit' });
  try {
    cli('setup', '--yes', '--no-login-item', '--no-start', '--no-plugin', '--projects-folder', path.join(tmp, 'projects'), '--port', String(E2E_PORT));
    const settingsFile = path.join(tmp, '.dev-plumbing', 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    fs.writeFileSync(settingsFile, JSON.stringify({ ...settings, homePageSize: 2, theme: 'light', openBrowserOnImport: false }, null, 2));
    // A git clone for the Claude-loop tests, with a remote and a matching repo profile.
    const repo = path.join(tmp, 'acme-app');
    fs.mkdirSync(repo);
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
    execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:acme/acme-app.git'], { cwd: repo });
    // What the visual screens check against: a Prisma schema, a Tailwind v4 kit, and two files for diagram boxes to point at.
    for (const [rel, text] of Object.entries(FIXTURE_FILES)) {
      fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
      fs.writeFileSync(path.join(repo, rel), text);
    }
    fs.mkdirSync(path.join(tmp, '.dev-plumbing', 'repos'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, '.dev-plumbing', 'repos', 'acme-app.json'),
      JSON.stringify({
        name: 'acme-app',
        match: ['github.com/acme/acme-app'],
        schema: { type: 'prisma', path: 'packages/db/prisma/schema.prisma' },
        apps: [{ name: 'web', path: 'apps/web', kitFiles: ['apps/web/app/globals.css'] }],
      }),
    );
    cli('demo');
    cli('start');
  } catch (err) {
    // Playwright skips globalTeardown when setup throws, so clean up here.
    try {
      cli('stop');
    } catch {
      /* best effort */
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(marker, { force: true });
    throw err;
  }
}
