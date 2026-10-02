import type { ChangePreview, OpenOptions, SubmitResponse, ThreadDraft } from '@dev-plumbing/core/schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, type DraftInput } from '../api/client';
import { Button } from './Button';
import { DiffView } from './DiffView';
import { inputClass } from './inputClass';

type Props = {
  repo: string;
  project: string;
  threadId: string;
  open: OpenOptions | null;
  presets: string[];
  defaultValue?: string;
  draft?: ThreadDraft | null;
  previews?: Record<string, ChangePreview>;
  compact?: boolean;
  /** Resolved threads can't be parked, so the thread view hides Park for them. */
  canPark?: boolean;
  onSent?: (r: SubmitResponse) => void;
};

const same = (a?: string, b?: string) => Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
export const HOW_SENDING_WORKS = "Nothing changes until you send. An accept with no note applies the changes and resolves the thread. A note keeps it open for Claude's follow-up.";

/** Radios for Claude's options, presets and Custom answer (or a plain box when there are none), a note, autosave, Park and Send. */
export function AnswerForm(p: Props) {
  const { canPark = true } = p;
  const qc = useQueryClient();
  const [choice, setChoice] = useState(p.draft?.optionId ?? '');
  const [note, setNote] = useState(p.draft?.note ?? '');
  const [text, setText] = useState(p.draft?.text ?? '');
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>(p.draft ? 'saved' : 'idle');
  const dirty = useRef(false);
  const closed = useRef(false);
  const latest = useRef<() => DraftInput | null>(() => null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const refresh = () => void qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === p.repo && q.queryKey[2] === p.project });

  // A new message from Claude means new options: start again from whatever the server has.
  const resetKey = `${p.threadId}:${p.open?.messageId ?? 'none'}`;
  useEffect(() => {
    setChoice(p.draft?.optionId ?? '');
    setNote(p.draft?.note ?? '');
    setText(p.draft?.text ?? '');
    dirty.current = false;
    closed.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const options = p.open?.options ?? [];
  const hasChoices = options.length > 0 || p.presets.length > 0;
  // Only what's showing is saved or sent: a note for another option stays in state but out of the draft.
  const showNote = Boolean(choice) && choice !== 'custom';
  const showText = choice === 'custom' || !hasChoices;
  const current = (): DraftInput | null => {
    const n = showNote && note.trim() ? note : '';
    const t = showText && text.trim() ? text : '';
    return choice || n || t ? { ...(choice ? { optionId: choice } : {}), ...(n ? { note: n } : {}), ...(t ? { text: t } : {}) } : null;
  };
  latest.current = current;

  // Leaving with unsaved typing: save it, without waiting for the autosave timer.
  useEffect(
    () => () => {
      if (dirty.current && !closed.current) void api.saveDraft(p.repo, p.project, p.threadId, latest.current()).catch(() => undefined);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Autosave half a second after the last change.
  useEffect(() => {
    if (!dirty.current) return;
    setSaved('saving');
    timer.current = setTimeout(() => {
      if (closed.current) return;
      dirty.current = false;
      api.saveDraft(p.repo, p.project, p.threadId, current()).then(
        () => {
          setSaved('saved');
          refresh();
        },
        () => {
          dirty.current = true;
          setSaved('error');
        },
      );
    }, 500);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice, note, text]);

  const edit = (fn: () => void) => {
    dirty.current = true;
    fn();
  };

  // A failed Send or Park leaves the form open: autosave and the unmount flush must work again.
  const reopen = () => {
    closed.current = false;
    dirty.current = true;
  };

  const send = useMutation({
    mutationFn: async () => {
      clearTimeout(timer.current);
      closed.current = true;
      dirty.current = false;
      // Save exactly what's on screen first, so Send never sends an older draft.
      await api.saveDraft(p.repo, p.project, p.threadId, current());
      return api.submit(p.repo, p.project, { scope: 'thread', threadId: p.threadId });
    },
    onSuccess: (r) => {
      p.onSent?.(r);
      refresh();
    },
    onError: reopen,
  });
  const park = useMutation({
    mutationFn: async () => {
      clearTimeout(timer.current);
      closed.current = true;
      dirty.current = false;
      // Keep what you typed: parking unmounts this form before a pending autosave would run.
      await api.saveDraft(p.repo, p.project, p.threadId, current());
      return api.park(p.repo, p.project, p.threadId, true);
    },
    onSuccess: refresh,
    onError: reopen,
  });

  const busy = send.isPending || park.isPending;
  const preview = choice ? p.previews?.[choice] : undefined;
  const canSend = hasChoices ? Boolean(choice) && (choice !== 'custom' || Boolean(text.trim())) : Boolean(text.trim());
  const name = `answer-${p.threadId}`;

  const renderChoice = (id: string, label: string, detail?: string, tag?: string) => {
    const selected = choice === id;
    return (
      <div key={id} className={`rounded-[8px] px-2.5 py-2 ${selected ? 'bg-selection' : ''}`}>
        <label className="flex cursor-pointer items-start gap-2.5">
          <input type="radio" name={name} value={id} checked={selected} onChange={() => edit(() => setChoice(id))} disabled={busy} className="mt-[3px] accent-slate" />
          <span className="min-w-0 flex-1">
            <span className="text-[13px] font-medium">{label}</span>
            {tag && <span className="ml-2 text-[11px] font-semibold text-slate">{tag}</span>}
            {detail && <span className="block text-[12px] text-ink-3">{detail}</span>}
          </span>
        </label>
        {selected && id === 'custom' && (
          <textarea aria-label="Custom answer" placeholder="Write your own answer…" value={text} onChange={(e) => edit(() => setText(e.target.value))} rows={3} disabled={busy} className={`${inputClass} mt-2`} />
        )}
        {selected && id !== 'custom' && (
          <textarea aria-label={`Note for ${label}`} placeholder="Add a note (optional)" value={note} onChange={(e) => edit(() => setNote(e.target.value))} rows={2} disabled={busy} className={`${inputClass} mt-2`} />
        )}
      </div>
    );
  };

  return (
    <div data-testid="answer-form">
      {!p.compact && <h3 className="text-[11px] font-semibold text-ink-3">Your answer</h3>}
      {hasChoices ? (
        <div role="radiogroup" aria-label="Your answer" className="mt-1.5 flex flex-col gap-0.5">
          {options.map((o) => renderChoice(o.id, o.label, o.detail, o.id === p.open?.recommended ? 'Recommended' : same(o.label, p.defaultValue) ? 'Default' : undefined))}
          {p.presets.map((label, i) => renderChoice(`preset:${i}`, label))}
          {renderChoice('custom', 'Custom answer')}
        </div>
      ) : (
        <textarea aria-label="Your answer" placeholder="Write your answer…" value={text} onChange={(e) => edit(() => setText(e.target.value))} rows={3} disabled={busy} className={`${inputClass} mt-1.5`} />
      )}

      {preview && (
        <section aria-label="What changes if you accept" className="mt-3 border-l-2 border-separator pl-3">
          <h4 className="text-[11px] font-semibold text-ink-3">What changes if you accept</h4>
          {preview.problem && <p className="mt-1 text-[12px] text-amber">{preview.problem}</p>}
          {preview.md && <DiffView segments={preview.md} />}
          {preview.items.map((i) => (
            <p key={i.itemId} className="mt-1 text-[12px] text-ink-2">
              <span className="font-medium">{i.title}</span>: {i.changes.map((c) => `${c.field} → ${c.after}`).join(', ')}
            </p>
          ))}
          {!(showNote && note.trim()) && <p className="mt-1 text-[11.5px] text-ink-3">Sent with no note, this applies straight away and resolves the thread.</p>}
        </section>
      )}

      <div
        className={`mt-3 flex flex-wrap items-center gap-2 ${p.compact ? '' : 'max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-10 max-md:border-t-[0.5px] max-md:border-separator max-md:bg-sidebar max-md:px-4 max-md:pb-6 max-md:pt-3 max-md:backdrop-blur-xl'}`}
      >
        <span className="text-[11.5px] text-ink-3">
          {saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Draft saved · goes with Submit all' : saved === 'error' ? "Couldn't save the draft." : ''}
        </span>
        <span className="ml-auto flex gap-2">
          {!p.compact && canPark && <Button disabled={busy} onClick={() => park.mutate()}>Park</Button>}
          <Button variant={p.compact ? 'secondary' : 'primary'} disabled={!canSend || busy} onClick={() => send.mutate()}>
            Send this thread
          </Button>
        </span>
      </div>
      {send.error && (
        <p role="alert" className="mt-2 text-[12.5px] text-seal">
          {(send.error as Error).message}
        </p>
      )}
      {!p.compact && <p className="mt-2 text-[11.5px] text-ink-3">{HOW_SENDING_WORKS}</p>}
    </div>
  );
}
