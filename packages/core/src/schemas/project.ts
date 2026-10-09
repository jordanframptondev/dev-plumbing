import { z } from 'zod';
import { anchorSchema } from './data';
import { codeRefSchema, itemFlagSchema, mdAnchorSchema, messageSchema } from './loop';
import { defenseRefSchema } from './whiteboard';

export const threadStatusValues = ['idle', 'your_turn', 'with_claude', 'resolved', 'parked'] as const;
export type ThreadStatus = (typeof threadStatusValues)[number];

/** One version of the repo's plan. v1 is the import; each update that brings a changed plan in adds the next. */
export const versionSchema = z.object({
  n: z.number().int().min(1),
  /** When it came in. v1's is the project's createdAt. */
  at: z.string(),
  /** sha256 hex of the repo's plan text, as source.hashAtImport is for v1. */
  hash: z.string(),
  /** The clone it was read from, ~-shortened. */
  clone: z.string(),
  branch: z.string(),
  /** HEAD of that clone when it was read, or null when it isn't known. */
  commit: z.string().nullable(),
  /**
   * How the update brought it into the draft: `clean` changes merged and `conflicts` left to settle, or `fresh` when
   * the draft was started again from this version. Absent for v1.
   */
  merge: z.object({ clean: z.number().int().min(0), conflicts: z.number().int().min(0), fresh: z.boolean().optional() }).optional(),
});
export type PlanVersion = z.infer<typeof versionSchema>;

export const plumbingProjectSchema = z.object({
  id: z.string().min(1),
  repo: z.string().min(1),
  title: z.string().min(1),
  source: z.object({ path: z.string(), clone: z.string(), branch: z.string(), hashAtImport: z.string() }),
  /** Every clone the project was opened from, ~-shortened, the source clone first. Accept offers them. */
  clones: z.array(z.string()).default([]),
  docs: z.object({
    original: z.string(),
    draft: z.string(),
    final: z.string().optional(),
    /** Where Accept last copied the final. `assets` are the mockup file names it wrote into `<name>.assets/`. */
    exportedTo: z.object({ clone: z.string(), path: z.string(), at: z.string(), assets: z.array(z.string()).default([]) }).optional(),
  }),
  status: z.enum(['importing', 'active', 'finalized']),
  emptyTypes: z.array(z.object({ type: z.string(), reason: z.string() })).default([]),
  /** Plumbing types whose importer hasn't written yet. */
  importPending: z.array(z.string()).default([]),
  /** Every version of the plan, oldest first. Empty means the project is still at v1, read from `source`. */
  versions: z.array(versionSchema).default([]),
  /**
   * Set while the importers re-run after an update: the version they import, and the status to go back to. `catchUp`
   * marks the re-import that catches the items up once that version's Plan changes are all settled (startCatchUp).
   */
  reimporting: z.object({ version: z.number().int().min(2), from: z.enum(['active', 'finalized']), catchUp: z.boolean().optional() }).optional(),
  /** The last version whose settled Plan changes the items were caught up with, so that re-import runs once per version. */
  caughtUp: z.number().int().min(2).optional(),
  /** While importing: the Claude window that runs the importers. Only it, or another once it's gone, ends the import. */
  importBy: z.string().optional(),
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
    /**
     * Set on an item started from one part of another item: a box, a mockup element or a flow step.
     * A malformed anchor reads as none, so it can never hide the item (reading never refuses).
     */
    anchor: anchorSchema.optional().catch(undefined),
    threadId: z.string(),
    createdBy: z.enum(['import', 'claude', 'you', 'whiteboard']),
    /** "May need another look": set when another thread's reply says it might affect this item. */
    flags: z.array(itemFlagSchema).optional(),
    /**
     * When you marked the item reviewed (ISO). Its only effect is taking the item off the Finalize page's "Nobody has
     * reviewed these". Any change to the item clears it (a flag, or a small edit or accept that rewrites its content),
     * so a changed item shows up there again.
     */
    reviewedAt: z.string().optional(),
    /** An imported item whose part of the plan was removed in this version. It's parked, never deleted. */
    removedIn: z.number().int().min(2).optional(),
    /** A Plan changes item: the passage as your draft, the old plan and the repo's new version had it. */
    conflict: z.object({ ours: z.string(), base: z.string(), theirs: z.string() }).optional(),
    /**
     * Set on every item the Whiteboard Defense made: a Defense item (Ask Claude about this) or a Questions or Concerns
     * item sent from it. `id` is the defense's id, and `kind` and `ref` name the part it came from.
     * A malformed reference reads as none, so it can never hide the item.
     */
    fromDefense: defenseRefSchema.optional().catch(undefined),
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
