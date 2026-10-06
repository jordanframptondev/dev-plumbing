import { z } from 'zod';

export const screens = ['diagram', 'database', 'mockups', 'flows', 'list'] as const;
export type Screen = (typeof screens)[number];

export const plumbingTypeHeaderSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'use lowercase letters, numbers and dashes, starting with a letter'),
  title: z.string().min(1),
  order: z.number().int(),
  screen: z.enum(screens),
  emptyMessage: z.string().min(1),
  fields: z.array(z.string()).default([]),
  answerPresets: z.array(z.string()).default([]),
  timeline: z.boolean().default(false),
  enabled: z.boolean().default(true),
  addLabel: z.string().min(1).max(40).optional(),
  /** Shipped in code (Plan changes), never read from a rules file: kept out of imports and of the rules lists. */
  builtIn: z.boolean().default(false),
});

export type PlumbingTypeHeader = z.infer<typeof plumbingTypeHeaderSchema>;
export type PlumbingType = PlumbingTypeHeader & { file: string; body: string; sections: Record<string, string> };

export const plumbingTypeHeaderDocs: { key: string; description: string }[] = [
  { key: 'id', description: 'Lowercase name, the same as the file name without .md.' },
  { key: 'title', description: 'The name shown in the sidebar.' },
  { key: 'order', description: 'Position in the sidebar. Lower comes first.' },
  { key: 'screen', description: 'Which screen draws it: diagram, database, mockups, flows or list.' },
  { key: 'emptyMessage', description: 'Shown when a plan has nothing for this type.' },
  { key: 'fields', description: 'Extra fields for list screens, e.g. [severity, likelihood].' },
  { key: 'answerPresets', description: "Standard answer choices, e.g. [\"Accept Claude's fix\", \"Accept the risk\"]." },
  { key: 'timeline', description: 'List screens only: show a timeline strip (used by Phases).' },
  { key: 'enabled', description: 'Set to false to hide this type without deleting it.' },
  { key: 'addLabel', description: 'List screens only: the name on the add button, e.g. Question for "+ Question". Leave it out for no button.' },
];

export function newRulesFileTemplate(id: string, title: string, order: number): string {
  return `---
id: ${id}
title: ${JSON.stringify(title)}
order: ${order}
screen: list
emptyMessage: ${JSON.stringify(`This plan has nothing for ${title}.`)}
fields: []
answerPresets: []
timeline: false
enabled: true
---

## What to look for
- Describe what the importer should find in a plan for this type.

## Rules
- Describe how Claude should write and discuss items of this type.

## Done when
- Describe when this type is fully plumbed.

## Always ask
- A question worth asking about every plan.
`;
}
