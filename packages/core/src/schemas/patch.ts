import type { MdPatch } from './loop';

export type PatchResult = { ok: true; text: string } | { ok: false; error: string };

export const countOccurrences = (text: string, find: string): number => (find ? text.split(find).length - 1 : 0);

const clip = (s: string) => (s.length > 80 ? `${s.slice(0, 77)}…` : s).replace(/\n/g, '⏎');

/**
 * Applies exact-text patches in order. Each `find` must appear exactly once in the text as it is when that
 * patch runs. Replacement text is used literally ($ has no special meaning).
 */
export function applyMdPatches(text: string, patches: MdPatch[]): PatchResult {
  let out = text;
  for (const [i, p] of patches.entries()) {
    const n = countOccurrences(out, p.find);
    if (n === 0) return { ok: false, error: `Patch ${i + 1}: the text to replace isn't in the draft: "${clip(p.find)}".` };
    if (n > 1) {
      return {
        ok: false,
        error: `Patch ${i + 1}: the text to replace appears ${n} times in the draft. Include more of the surrounding text so it matches once: "${clip(p.find)}".`,
      };
    }
    const at = out.indexOf(p.find);
    out = out.slice(0, at) + p.replace + out.slice(at + p.find.length);
  }
  return { ok: true, text: out };
}

/** The patches that undo `patches`. A patch that deleted text outright (empty replace) can't be inverted. */
export function invertMdPatches(patches: MdPatch[]): { ok: true; patches: MdPatch[] } | { ok: false; error: string } {
  if (patches.some((p) => p.replace === '')) return { ok: false, error: "A change that deletes text outright can't be undone." };
  return { ok: true, patches: [...patches].reverse().map((p) => ({ find: p.replace, replace: p.find })) };
}
