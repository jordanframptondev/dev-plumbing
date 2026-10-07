import { submitMessage, type ProjectRef, type SubmitResponse } from '@dev-plumbing/core';
import { projectKey, type Runtime } from '../runtime';

/**
 * What the browser hears after sending threads (Send this thread, Submit all, a new item, Ask Claude about this): the
 * counts, the listening window's state and the line to show. A listening window is woken when anything was sent.
 */
export function submitResponse(rt: Runtime, ref: ProjectRef, r: { resolved: string[]; sent: string[]; skipped: { threadId: string; reason: string }[] }): SubmitResponse {
  const key = projectKey(ref.repo, ref.id);
  if (r.sent.length) rt.listeners.notify(key);
  const listening = rt.listeners.state(key);
  const counts = { resolved: r.resolved.length, sent: r.sent.length, skipped: r.skipped };
  return { ...counts, listening, message: submitMessage(counts, listening) };
}
