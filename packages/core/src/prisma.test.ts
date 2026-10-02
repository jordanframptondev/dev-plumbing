import { describe, expect, it } from 'vitest';
import { parsePrismaSchema } from './prisma';

const ACME = `// Acme's database.
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

/// A person who buys from Acme.
model Customer {
  id            String         @id @default(cuid())
  email         String         @unique
  name          String?
  subscriptions Subscription[]
  createdAt     DateTime       @default(now())
}

model Subscription {
  id         String             @id @default(cuid())
  customer   Customer           @relation(fields: [customerId], references: [id], onDelete: Cascade)
  customerId String
  status     SubscriptionStatus @default(ACTIVE) // paused ones get no reminders
  website    String             @default("https://acme.test//shop")
  price      Decimal            @db.Decimal(10, 2)
  search     Unsupported("tsvector")?
  orders     Order[]

  @@index([customerId])
  @@map("subscriptions")
}

model Order {
  id             String       @id
  subscription   Subscription @relation(fields: [subscriptionId], references: [id])
  subscriptionId String
  tags           String[]
}

enum SubscriptionStatus {
  ACTIVE
  PAUSED // for now
  CANCELLED
}
`;

describe('reading a Prisma schema', () => {
  it('reads models, their fields with types as written, and enums', () => {
    const s = parsePrismaSchema(ACME);
    expect([...s.models.keys()]).toEqual(['Customer', 'Subscription', 'Order']);
    expect(Object.fromEntries(s.models.get('Customer')!)).toEqual({
      id: 'String',
      email: 'String',
      name: 'String?',
      subscriptions: 'Subscription[]',
      createdAt: 'DateTime',
    });
    expect(Object.fromEntries(s.models.get('Subscription')!)).toEqual({
      id: 'String',
      customer: 'Customer',
      customerId: 'String',
      status: 'SubscriptionStatus',
      website: 'String',
      price: 'Decimal',
      search: 'Unsupported("tsvector")?',
      orders: 'Order[]',
    });
    expect(s.models.get('Order')?.get('tags')).toBe('String[]');
    expect([...s.enums]).toEqual(['SubscriptionStatus']);
  });

  it("skips what it doesn't understand instead of throwing", () => {
    expect(parsePrismaSchema('')).toEqual({ models: new Map(), enums: new Set() });
    const s = parsePrismaSchema('model Half {\n  id String\n  ??? nonsense\n');
    expect(Object.fromEntries(s.models.get('Half')!)).toEqual({ id: 'String' });
  });
});
