import { splitSections } from './rules';
import type { PlumbingType } from './schemas';

/** The built-in plumbing type for the questions you ask Claude about the Whiteboard Defense ("Ask Claude about this"). */
export const DEFENSE = 'defense';

/** postReply's problem when a reply on a Defense thread would change the draft. */
export const DEFENSE_CHANGE_REFUSAL =
  "A Defense thread can't change the draft. Leave out change and smallEdits. If the plan needs to change, add a Questions or Concerns item with newItems.";
/** The only plumbing types a reply on a Defense thread may add an item of: a gap it shows is a question or a concern. */
export const DEFENSE_NEW_ITEM_TYPES: readonly string[] = ['questions', 'concerns'];
/** postReply's problem when a reply on a Defense thread adds an item of any other type. */
export const DEFENSE_NEW_ITEMS_REFUSAL = 'A Defense thread can add only Questions or Concerns items.';
/** postReply's problem when a reply on a Defense thread resolves another item: its decision is about the defense. */
export const DEFENSE_RESOLVE_REFUSAL = 'A Defense thread can resolve only itself.';

// The thread subagent reads the Rules section. Defense items are made by the Whiteboard Defense page, never by an
// importer, and the person's question is always the thread's first message.
const RULES = `## What to look for
- Nothing to import. A Defense item is made when the person asks Claude about one part of the project's Whiteboard Defense, on the Whiteboard Defense page.

## Rules
- Each thread is the person's question about one part of the project's Whiteboard Defense: a section, a question the engineer should be able to answer, or a release concern. The item's body is that part, as Markdown, and the pack's \`defense\` is the whole defense.
- Answer plainly, from the plan, the draft, the decisions and the code you can read. Say which of your statements are known (you read it), inferred (it follows from what you read) or unknown.
- Never offer a change to the draft: no option has a \`change\`, and the reply has no \`smallEdits\`. dev-plumbing refuses a Defense reply that has either.
- When your answer needs nothing more from the person, send it with \`resolve\` and a one-line decision that sums it up, so it doesn't wait in their Inbox. They can reply to carry on. Resolve only this thread: leave out \`resolve.itemIds\`.
- Offer options only when the person must choose.
- When the answer shows a gap or a risk the plan doesn't cover, add a Questions or Concerns item with \`newItems\`, and say so in your reply. A Defense thread can't add an item of any other type.
- When the person says their question is answered, resolve the thread with a one-line decision that sums up the answer.

## Done when
- The person's question is answered, and the thread is resolved.
`;

/**
 * Defense ships in code, like Plan changes: it needs no setup, and it's never imported, listed among the rules files,
 * turned off or put on the Finalize checklist, and never goes into the final. Its order puts it after every shipped
 * type, and the navigation shows it only once the project has a Defense item. loadConfig adds it, unless the user has
 * their own plumbing/defense.md.
 */
export const DEFENSE_TYPE: PlumbingType = {
  id: DEFENSE,
  title: 'Defense questions',
  order: 100,
  screen: 'list',
  emptyMessage: 'Nothing asked about the Whiteboard Defense yet.',
  fields: [],
  answerPresets: [],
  timeline: false,
  enabled: true,
  builtIn: true,
  file: '',
  body: RULES,
  sections: splitSections(RULES),
};
