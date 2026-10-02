/** Answer forms with typing that isn't saved yet, so Submit all can save it before it submits. */
const pending = new Map<object, () => Promise<unknown>>();

/** `owner` has an unsaved edit, and `flush` saves it. */
export function setPendingDraft(owner: object, flush: () => Promise<unknown>): void {
  pending.set(owner, flush);
}

/** `owner`'s edit is saved, or gone. With `flush`, only if that is still the one registered. */
export function clearPendingDraft(owner: object, flush?: () => Promise<unknown>): void {
  if (!flush || pending.get(owner) === flush) pending.delete(owner);
}

/** Saves every unsaved edit. Rejects if one couldn't be saved. */
export async function flushPendingDrafts(): Promise<void> {
  await Promise.all([...pending.values()].map((flush) => flush()));
}
