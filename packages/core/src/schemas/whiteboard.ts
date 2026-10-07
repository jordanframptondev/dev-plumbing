import { z } from 'zod';

// The Whiteboard Defense (spec §12): what the whiteboard subagent sends, what the project folder keeps in whiteboard/,
// and the labels the app shows. Every statement is a claim tagged with what it rests on.

export const basisValues = ['known', 'inferred', 'unknown', 'verify'] as const;
export type Basis = (typeof basisValues)[number];
export const severityValues = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type Severity = (typeof severityValues)[number];
export const ratingValues = ['could', 'shaky', 'couldnt'] as const;
export type Rating = (typeof ratingValues)[number];

/** The ten prose sections, in the order Study shows them; n is the section's number among the 13. */
export const DEFENSE_SECTIONS = [
  { id: 'summary', n: 1, title: 'Executive summary' },
  { id: 'diagram', n: 2, title: 'Whiteboard diagram' },
  { id: 'walkthrough', n: 3, title: 'System walkthrough' },
  { id: 'data', n: 4, title: 'Data and state' },
  { id: 'security', n: 5, title: 'Security model' },
  { id: 'failure', n: 6, title: 'Failure analysis' },
  { id: 'tradeoffs', n: 7, title: 'Dependencies and tradeoffs' },
  { id: 'complexity', n: 8, title: 'Complexity review' },
  { id: 'readiness', n: 9, title: 'Production readiness' },
  { id: 'unknowns', n: 12, title: 'Unknowns' },
] as const;
export type DefenseSectionId = (typeof DEFENSE_SECTIONS)[number]['id'];
export const sectionIds = DEFENSE_SECTIONS.map((s) => s.id) as [DefenseSectionId, ...DefenseSectionId[]];
/** Sections 10, 11 and 13, which have their own shapes. */
export const DEFENSE_PARTS = {
  questions: { n: 10, title: 'Questions the engineer should be able to answer' },
  concerns: { n: 11, title: 'Release concerns' },
  checklist: { n: 13, title: 'Checklist' },
} as const;
export const LEVEL_NAMES: Record<1 | 2 | 3, string> = { 1: 'Lightweight', 2: 'Standard', 3: 'High risk' };
export const BASIS_LABELS: Record<Basis, string> = { known: 'Known', inferred: 'Inferred', unknown: 'Unknown', verify: 'Verify before release' };
export const SEVERITY_LABELS: Record<Severity, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', info: 'Informational' };

export const claimSchema = z.object({ text: z.string().trim().min(1).max(4000), basis: z.enum(basisValues) });
export type Claim = z.infer<typeof claimSchema>;
export const defenseTableSchema = z.object({
  title: z.string().trim().min(1).max(200),
  columns: z.array(z.string().trim().min(1).max(200)).min(1).max(8),
  rows: z.array(z.array(z.string().max(1000))).min(1).max(50),
});
export type DefenseTable = z.infer<typeof defenseTableSchema>;

/** What the whiteboard subagent sends with dp_whiteboard. */
export const defenseInputSchema = z.object({
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  levelReasons: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
  sections: z
    .array(
      z.object({
        id: z.enum(sectionIds),
        // At least one: saveDefense says so in its own words.
        claims: z.array(claimSchema).max(40),
        tables: z.array(defenseTableSchema).max(5).optional(),
        /** A plain-text diagram, shown as written. */
        diagram: z.string().max(6000).optional(),
        /** An item of this project whose drawing is a diagram. */
        diagramItemId: z.string().min(1).optional(),
      }),
    )
    // Missing and doubled ids: saveDefense says so.
    .max(20),
  questions: z
    .array(z.object({ q: z.string().trim().min(1).max(500), a: z.string().trim().min(1).max(4000), basis: z.enum(basisValues) }))
    .min(1)
    .max(40),
  concerns: z.array(z.object({ severity: z.enum(severityValues), text: z.string().trim().min(1).max(2000), basis: z.enum(basisValues) })).max(40),
  // Empty when the rules file has a checklist: the service copies that one (saveDefense).
  checklist: z.array(z.string().trim().min(1).max(300)).max(40),
});
export type DefenseInput = z.infer<typeof defenseInputSchema>;

/** whiteboard/defense.json. */
export const whiteboardDefenseSchema = z.object({
  /** newId('w', now) */
  id: z.string().min(1),
  generatedAt: z.string(),
  /** What it was written from: the final while it's current, else the draft, and defenseInputsHash at the time. */
  basedOn: z.object({ kind: z.literal('plan'), doc: z.enum(['final', 'draft']), version: z.number().int().min(1), inputsHash: z.string() }),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  levelReasons: z.array(z.string()),
  /** Exactly DEFENSE_SECTIONS, in that order. */
  sections: z.array(
    z.object({
      id: z.enum(sectionIds),
      title: z.string(),
      claims: z.array(claimSchema),
      tables: z.array(defenseTableSchema),
      diagram: z.string().nullable(),
      diagramItemId: z.string().nullable(),
    }),
  ),
  /** Ids q1, q2, … */
  questions: z.array(z.object({ id: z.string(), q: z.string(), a: z.string(), basis: z.enum(basisValues) })),
  /** Ids c1, …; most severe first. */
  concerns: z.array(z.object({ id: z.string(), severity: z.enum(severityValues), text: z.string(), basis: z.enum(basisValues) })),
  /** Ids k1, … */
  checklist: z.array(z.object({ id: z.string(), text: z.string() })),
  /** Where Export .md last wrote it. */
  exportedTo: z.object({ clone: z.string(), path: z.string(), at: z.string() }).optional(),
});
export type WhiteboardDefense = z.infer<typeof whiteboardDefenseSchema>;
export type DefenseExport = NonNullable<WhiteboardDefense['exportedTo']>;

export const whiteboardStateValues = ['requested', 'writing', 'failed'] as const;
export type WhiteboardState = (typeof whiteboardStateValues)[number];
/** whiteboard/request.json. Absent when no defense is being asked for. */
export const whiteboardRequestSchema = z.object({
  /** newId('g', now) */
  id: z.string().min(1),
  state: z.enum(whiteboardStateValues),
  requestedAt: z.string(),
  /** The listening window that took it, through dp_wait. */
  pickedUpAt: z.string().optional(),
  pickedUpBy: z.string().optional(),
  /** At pick-up: what the subagent reads. saveDefense copies these into basedOn. */
  inputsHash: z.string().optional(),
  basedOn: z.object({ doc: z.enum(['final', 'draft']), version: z.number().int().min(1) }).optional(),
  /** When a window that went away gave it back. */
  requeuedAt: z.string().optional(),
  failedAt: z.string().optional(),
  reason: z.string().optional(),
});
export type WhiteboardRequest = z.infer<typeof whiteboardRequestSchema>;

/** whiteboard/practice.json, keyed by the question's text and the checklist line's text (trimmed). */
export const practiceSchema = z.object({
  ratings: z.record(z.object({ rating: z.enum(ratingValues), at: z.string() })).default({}),
  /** text -> when ticked */
  ticks: z.record(z.string()).default({}),
});
export type Practice = z.infer<typeof practiceSchema>;

export const defenseRefKinds = ['section', 'question', 'concern', 'claim'] as const;
export type DefenseRefKind = (typeof defenseRefKinds)[number];
/**
 * A part of a defense. section: a DefenseSectionId; question: q<n>; concern: c<n>;
 * claim: `${sectionId}.${index}` (index from 0 in that section's claims). `text` is the part's own text, kept on the
 * Questions and Concerns items sent from it, so a regenerated defense with the same unknown knows it was sent.
 */
export const defenseRefSchema = z.object({ id: z.string(), kind: z.enum(defenseRefKinds), ref: z.string(), text: z.string().optional() });
export type DefenseRef = z.infer<typeof defenseRefSchema>;
