import { z } from 'zod';

export const threadStatusValues = ['idle', 'your_turn', 'with_claude', 'resolved', 'parked'] as const;
export type ThreadStatus = (typeof threadStatusValues)[number];

export const plumbingProjectSchema = z.object({
  id: z.string().min(1),
  repo: z.string().min(1),
  title: z.string().min(1),
  source: z.object({ path: z.string(), clone: z.string(), branch: z.string(), hashAtImport: z.string() }),
  docs: z.object({
    original: z.string(),
    draft: z.string(),
    final: z.string().optional(),
    exportedTo: z.object({ clone: z.string(), path: z.string(), at: z.string() }).optional(),
  }),
  status: z.enum(['importing', 'active', 'finalized']),
  emptyTypes: z.array(z.object({ type: z.string(), reason: z.string() })).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PlumbingProject = z.infer<typeof plumbingProjectSchema>;

export const itemSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    title: z.string(),
    summary: z.string(),
    body: z.string().optional(),
    fields: z.record(z.string()).optional(),
    mdAnchor: z.object({ heading: z.string(), lines: z.tuple([z.number(), z.number()]).optional() }).optional(),
    codeRefs: z.array(z.object({ path: z.string(), symbol: z.string().optional(), verified: z.boolean().optional() })).optional(),
    links: z.array(z.string()).optional(),
    data: z.unknown().optional(),
    threadId: z.string(),
    createdBy: z.enum(['import', 'claude', 'you', 'whiteboard']),
  })
  .passthrough();
export type Item = z.infer<typeof itemSchema>;

export const messageSchema = z
  .object({ id: z.string(), at: z.string(), author: z.enum(['you', 'claude', 'system']), text: z.string().optional() })
  .passthrough();

export const threadSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  status: z.enum(threadStatusValues),
  draft: z
    .object({ optionId: z.string().optional(), note: z.string().optional(), text: z.string().optional(), updatedAt: z.string() })
    .optional(),
  messages: z.array(messageSchema),
});
export type Thread = z.infer<typeof threadSchema>;
