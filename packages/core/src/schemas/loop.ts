import { z } from 'zod';

/** Ids that are safe as file names and URL segments. */
export const ID = /^[a-z0-9][a-z0-9-]*$/;
export const idSchema = z.string().max(80).regex(ID, 'use lowercase letters, numbers and dashes, starting with a letter or number');

export const codeRefSchema = z.object({
  path: z.string().min(1).max(300),
  symbol: z.string().min(1).max(200).optional(),
  verified: z.boolean().optional(),
});
export type CodeRef = z.infer<typeof codeRefSchema>;

export const mdAnchorSchema = z.object({
  heading: z.string().min(1).max(200),
  lines: z.tuple([z.number().int().min(1), z.number().int().min(1)]).optional(),
});

export const mdPatchSchema = z.object({ find: z.string().min(1).max(10_000), replace: z.string().max(20_000) });
export type MdPatch = z.infer<typeof mdPatchSchema>;

export const itemPatchSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    summary: z.string().min(1).max(500).optional(),
    body: z.string().max(20_000).optional(),
    fields: z.record(z.string().max(500)).optional(),
    links: z.array(z.string()).max(30).optional(),
    codeRefs: z.array(codeRefSchema).max(30).optional(),
    mdAnchor: mdAnchorSchema.optional(),
    data: z.unknown().optional(),
  })
  .strict();
export type ItemPatch = z.infer<typeof itemPatchSchema>;

/** What accepting an option, or applying a small edit, does: exact-text patches on draft.md and item updates. */
export const changeSchema = z
  .object({
    md: z.array(mdPatchSchema).max(20).optional(),
    items: z.array(z.object({ itemId: z.string().min(1), patch: itemPatchSchema })).max(20).optional(),
  })
  .strict();
export type Change = z.infer<typeof changeSchema>;

export const optionSchema = z.object({
  id: idSchema,
  label: z.string().min(1).max(200),
  detail: z.string().max(2_000).optional(),
  change: changeSchema.optional(),
});
export type Option = z.infer<typeof optionSchema>;

export const itemFlagSchema = z.object({ reason: z.string(), fromThreadId: z.string(), at: z.string() });

export const youMessageSchema = z
  .object({
    id: z.string(),
    at: z.string(),
    author: z.literal('you'),
    optionId: z.string().optional(),
    optionLabel: z.string().optional(),
    note: z.string().optional(),
    text: z.string().optional(),
    sentWith: z.enum(['thread', 'all']).optional(),
  })
  .passthrough();

export const claudeMessageSchema = z
  .object({
    id: z.string(),
    at: z.string(),
    author: z.literal('claude'),
    text: z.string(),
    options: z.array(optionSchema).optional(),
    recommended: z.string().optional(),
    smallEdits: z.array(z.object({ changeId: z.string(), summary: z.string() })).optional(),
    newItemIds: z.array(z.string()).optional(),
    impacts: z.array(z.object({ itemId: z.string(), reason: z.string() })).optional(),
    filesRead: z.array(z.string()).optional(),
    resolved: z.boolean().optional(),
    /** The message an importer wrote when the item was created. */
    opening: z.boolean().optional(),
  })
  .passthrough();

export const systemMessageSchema = z.object({ id: z.string(), at: z.string(), author: z.literal('system'), text: z.string() }).passthrough();

export const messageSchema = z.discriminatedUnion('author', [youMessageSchema, claudeMessageSchema, systemMessageSchema]);
export type Message = z.infer<typeof messageSchema>;
export type YouMessage = z.infer<typeof youMessageSchema>;
export type ClaudeMessage = z.infer<typeof claudeMessageSchema>;
export type SystemMessage = z.infer<typeof systemMessageSchema>;

/**
 * What you've typed but not sent.
 * `optionId` is one of Claude's option ids, `preset:<n>` for the plumbing type's nth answer preset, or `custom`.
 */
export type ThreadDraft = { optionId?: string; note?: string; text?: string; updatedAt: string };
const draftSchema = z.object({ optionId: z.string().optional(), note: z.string().optional(), text: z.string().optional(), updatedAt: z.string() });

export const decisionSchema = z.object({
  id: z.string(),
  text: z.string(),
  threadId: z.string(),
  itemIds: z.array(z.string()),
  at: z.string(),
  supersededBy: z.string().optional(),
});
export type Decision = z.infer<typeof decisionSchema>;

/** One press of Send this thread or Submit all. `sent` threads went to Claude; `resolved` ones were plain accepts. */
export const submissionSchema = z.object({
  id: z.string(),
  at: z.string(),
  scope: z.enum(['thread', 'all']),
  drafts: z.record(draftSchema),
  sent: z.array(z.string()).default([]),
  resolved: z.array(z.string()).default([]),
  processedAt: z.string().optional(),
  pickedUpAt: z.string().optional(),
  pickedUpBy: z.string().optional(),
  finishedAt: z.string().optional(),
  requeuedAt: z.string().optional(),
});
export type Submission = z.infer<typeof submissionSchema>;

/** One change to the draft or items, kept in history/ for the Changes view and for Undo. */
export const historyEntrySchema = z.object({
  id: z.string(),
  at: z.string(),
  threadId: z.string(),
  kind: z.enum(['small-edit', 'accept']),
  summary: z.string(),
  change: changeSchema,
  appliedAt: z.string().optional(),
  undoneAt: z.string().optional(),
  itemsBefore: z.record(z.unknown()).default({}),
  itemsAfter: z.record(z.unknown()).default({}),
});
export type HistoryEntry = z.infer<typeof historyEntrySchema>;
export type ChangeState = 'applied' | 'undone' | 'pending';
export const changeState = (h: Partial<HistoryEntry>): ChangeState => (h.undoneAt ? 'undone' : h.appliedAt ? 'applied' : 'pending');

// What subagents send. Limits keep a confused subagent from writing huge files.

export const claudeMessageInputSchema = z.object({
  text: z.string().min(1).max(20_000),
  options: z.array(optionSchema).min(1).max(6).optional(),
  recommended: z.string().optional(),
});

export const importItemSchema = z.object({
  key: idSchema,
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(500),
  body: z.string().max(20_000).optional(),
  fields: z.record(z.string().max(500)).optional(),
  mdAnchor: mdAnchorSchema.optional(),
  codeRefs: z.array(codeRefSchema.omit({ verified: true })).max(30).optional(),
  links: z.array(z.string()).max(30).optional(),
  data: z.unknown().optional(),
  message: claudeMessageInputSchema.optional(),
});
export type ImportItem = z.infer<typeof importItemSchema>;

/** Either items or a "no changes" reason, never both. Checked by writeImportBatch. */
export const importBatchSchema = z.object({
  items: z.array(importItemSchema).max(60).optional(),
  noChanges: z.string().min(1).max(500).optional(),
});
export type ImportBatch = z.infer<typeof importBatchSchema>;

export const newItemSchema = importItemSchema.omit({ key: true, links: true }).extend({
  type: z.string().min(1),
  message: claudeMessageInputSchema,
});

export const replySchema = z.object({
  threadId: z.string().min(1),
  text: z.string().min(1).max(20_000),
  options: z.array(optionSchema).min(1).max(6).optional(),
  recommended: z.string().optional(),
  smallEdits: z.array(z.object({ summary: z.string().min(1).max(200), change: changeSchema })).max(10).optional(),
  newItems: z.array(newItemSchema).max(10).optional(),
  impacts: z.array(z.object({ itemId: z.string().min(1), reason: z.string().min(1).max(300) })).max(20).optional(),
  filesRead: z.array(z.string()).max(200).optional(),
  resolve: z.object({ decision: z.string().min(1).max(300), itemIds: z.array(z.string()).optional() }).optional(),
});
export type ReplyInput = z.infer<typeof replySchema>;
