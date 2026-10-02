import { z } from 'zod';
import { codeRefSchema, itemFlagSchema, mdAnchorSchema, messageSchema } from './loop';

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
  /** Plumbing types whose importer hasn't written yet. */
  importPending: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PlumbingProject = z.infer<typeof plumbingProjectSchema>;

export const itemSchema = z
  .object({
    id: z.string(),
    /** The importer's key, kept so a later re-import can match the item. */
    key: z.string().optional(),
    type: z.string(),
    title: z.string(),
    summary: z.string(),
    body: z.string().optional(),
    fields: z.record(z.string()).optional(),
    mdAnchor: mdAnchorSchema.optional(),
    codeRefs: z.array(codeRefSchema).optional(),
    links: z.array(z.string()).optional(),
    data: z.unknown().optional(),
    threadId: z.string(),
    createdBy: z.enum(['import', 'claude', 'you', 'whiteboard']),
    /** "May need another look": set when another thread's reply says it might affect this item. */
    flags: z.array(itemFlagSchema).optional(),
  })
  .passthrough();
export type Item = z.infer<typeof itemSchema>;

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
