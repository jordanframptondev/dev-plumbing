import { DEFENSE } from './defenseType';
import { splitSections } from './rules';
import type { PlumbingType } from './schemas';

/** The built-in plumbing type for passages that both your draft and the repo's new version of the plan changed. */
export const PLAN_CHANGES = 'plan-changes';

/** Why an unresolved Plan changes item blocks Finalize. */
export const CONFLICT_REASON = "Your draft and the repo's new version disagree here.";

// The thread subagent reads the Rules section. Plan changes items are made by an update, never by an importer.
const RULES = `## What to look for
- Nothing to import. When dev-plumbing brings a new version of the plan in, it makes one Plan changes item for each passage that both the draft and the repo's new version changed.

## Rules
- Each thread is one passage that both the draft and the repo changed. The item's body shows it three ways, each in a fenced block: **Your draft** (the passage in the draft when the update ran), **The repo (vN)** (the repo's new text) and **Before (vN-1)** (the text both sides started from). "(nothing)" means that side has no text there.
- Until the person decides, the draft keeps its own text. None of the repo's text for this passage is in the draft.
- When the thread has no message from the person yet, reply with three options, each with a \`change\`, so the person can accept any of them in one click:
  - \`merged\`, "Use the merged version": one version of the passage that keeps what each side meant to change. Make it the recommended option.
  - \`theirs\`, "Take the repo's version": its \`change.md\` replaces the draft's text for this passage with the repo's. Leave it out when "Your draft" is "(nothing)" and no text next to where the passage was appears in the draft exactly once.
  - \`keep\`, "Keep my draft": \`change: { md: [] }\`. It changes nothing, and accepting it settles the thread.
  - If the draft already says what the repo's version says, offer only "Keep my draft", as the recommended option.
  - If the merged version is the draft as it is, leave \`merged\` out and recommend Keep my draft.
- Each \`change.md\` patch's \`find\` is the draft's current text, copied exactly from the draft file (it may have changed since the update), with enough of the text around it to appear in the draft exactly once. \`replace\` is that same text as it should read. Use up to 20 patches, each \`find\` unique, in the order they appear in the draft. When "Your draft" is over about 8,000 characters, split it by paragraph, one patch per paragraph.
- When "Your draft" is "(nothing)", the draft deleted this passage. Anchor \`find\` on the draft's text just before or after where it was, and keep that text in \`replace\`.
- When "The repo" is "(nothing)", the repo deleted this passage or moved it. If the body says the repo moved it, the draft now has the repo's copy there as well as yours here: the merged version carries the draft's edits into the moved copy and removes this one, which takes two patches. If the repo deleted it, say so, and let the merged version keep only what the draft added that still matters.
- In \`text\`, say in one or two sentences what each side changed, and which decisions so far bear on it.
- When the person answers with the preset "Keep my draft", resolve the thread with no change, with the decision "<item title>: kept my draft".
- When they answer with the preset "Take the repo's version", offer one recommended option whose \`change.md\` replaces the draft's text for this passage with the repo's, so they can accept it.
- Never put conflict markers (lines like <<<<<<<, |||||||, ======= or >>>>>>>) in the draft.

## Done when
- The draft has the version of the passage the person chose, and the thread is resolved.
`;

/**
 * Plan changes ships in code, not as a rules file: it needs no setup, and it's never imported, listed among the rules
 * files or turned off. loadConfig always adds it, and its id is kept for it: a plumbing/plan-changes.md is reported and
 * ignored.
 */
export const PLAN_CHANGES_TYPE: PlumbingType = {
  id: PLAN_CHANGES,
  title: 'Plan changes',
  order: 0,
  screen: 'list',
  emptyMessage: "Nothing in the repo's new version conflicts with your draft.",
  fields: [],
  answerPresets: ['Keep my draft', "Take the repo's version"],
  timeline: false,
  enabled: true,
  builtIn: true,
  file: '',
  body: RULES,
  sections: splitSections(RULES),
};

/**
 * The types an import (or a re-import) runs an importer for: the enabled ones that aren't built in. Plan changes items
 * are made by an update and Defense items by the Whiteboard Defense page, never by an importer.
 */
export function importableTypes(types: PlumbingType[]): PlumbingType[] {
  return types.filter((t) => t.enabled && !t.builtIn && t.id !== PLAN_CHANGES && t.id !== DEFENSE);
}
