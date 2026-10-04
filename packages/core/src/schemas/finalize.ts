import { z } from 'zod';

export const finalizeStateValues = ['requested', 'writing', 'proposed', 'failed'] as const;
export type FinalizeState = (typeof finalizeStateValues)[number];

/** finalize.json in the project folder. Absent when no finalize is under way. */
export type FinalizeRequest = {
  id: string;
  state: FinalizeState;
  requestedAt: string;
  /** The listening window that took it, through dp_wait. */
  pickedUpAt?: string;
  pickedUpBy?: string;
  proposal?: { at: string; draftHash: string; file: 'docs/final.proposed.md'; length: number };
  failedAt?: string;
  reason?: string;
};

export const finalizeRequestSchema: z.ZodType<FinalizeRequest> = z.object({
  id: z.string().min(1),
  state: z.enum(finalizeStateValues),
  requestedAt: z.string(),
  pickedUpAt: z.string().optional(),
  pickedUpBy: z.string().optional(),
  proposal: z
    .object({ at: z.string(), draftHash: z.string(), file: z.literal('docs/final.proposed.md'), length: z.number().int().min(0) })
    .optional(),
  failedAt: z.string().optional(),
  reason: z.string().optional(),
});

/** One line on the Finalize page's checklist, linking to the item's thread. */
export type ChecklistEntry = { itemId: string; threadId: string; title: string; typeTitle: string; reason: string };

/** What the Finalize page lists before you start. Each item appears at most once. */
export type FinalizeChecklist = {
  /** "These block Finalize" */
  blocking: ChecklistEntry[];
  /** "These will use their default" */
  defaults: (ChecklistEntry & { defaultValue: string })[];
  /** "Parked: left out of the final" */
  parked: ChecklistEntry[];
  /** "Nobody has reviewed these": a warning, never a block. */
  unreviewed: ChecklistEntry[];
  /** blocking.length === 0 */
  canStart: boolean;
};
