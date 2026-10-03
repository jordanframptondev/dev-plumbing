import { parseData, type Anchor, type TypeItemRow } from '@dev-plumbing/core/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../../api/client';
import { Button } from '../../components/Button';
import { MockupFrame, type FramePin } from '../../components/MockupFrame';
import { Segmented } from '../../components/Segmented';
import { StatusMark } from '../../components/StatusMark';
import { AnchorForm } from './AnchorForm';
import { DataProblem } from './DataProblem';
import { OtherItems } from './OtherItems';
import { anchorsOn, toneOf } from './rows';
import type { ScreenProps } from './VisualScreen';

type Side = 'after' | 'before';
type Device = 'desktop' | 'mobile';
type Mockup = { after: string | null; before: string | null; route: string | null; files: string[]; kit: string | null };
type UiScreen = { row: TypeItemRow; mockup: Mockup | null; problems: string[] };

const ASK_FOR_MOCKUP = "Please draw the After mockup for this screen with the app's kit, and a Before from the current component if the screen exists today.";
const LIST = 'overflow-hidden rounded-[10px] border-[0.5px] border-separator bg-cell [&>*+*]:border-t-[0.5px] [&>*+*]:border-separator';

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * What the screen needs from a UI item's data. Markup is read leniently: it's drawn even when it breaks a write rule
 * (written by hand, or by an older version), because the sandboxed frame, not the write check, is what keeps it
 * harmless. The rule problems are listed beside it.
 */
function readMockup(data: unknown): { mockup: Mockup | null; problems: string[] } {
  if (data === null || data === undefined) return { mockup: null, problems: [] };
  const parsed = parseData('mockups', data);
  if (parsed.ok) {
    const d = parsed.data;
    return { mockup: { after: text(d.after), before: text(d.before), route: d.location.route ?? null, files: d.location.files, kit: text(d.kit) }, problems: [] };
  }
  if (!isObject(data)) return { mockup: null, problems: parsed.problems };
  const location = isObject(data.location) ? data.location : {};
  const files = Array.isArray(location.files) ? location.files.filter((f): f is string => typeof f === 'string') : [];
  return { mockup: { after: text(data.after), before: text(data.before), route: text(location.route), files, kit: text(data.kit) }, problems: parsed.problems };
}

/** A short fingerprint of the markup, so the frame reloads when it's redrawn. */
function hashOf(markup: string): string {
  let h = 5381;
  for (let i = 0; i < markup.length; i++) h = (h * 33 + markup.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** "No mockup yet.": the item's own description, and a button that asks Claude to draw one. */
function NoMockup({ row, repo, project }: { row: TypeItemRow; repo: string; project: string }) {
  const qc = useQueryClient();
  const ask = useMutation({
    mutationFn: async () => {
      // Text you'd already typed for this thread goes along, after the request, and an option you'd picked stays picked.
      const message = [ASK_FOR_MOCKUP, row.draft?.text].filter(Boolean).join('\n\n');
      const optionId = row.draft?.optionId;
      await api.saveDraft(repo, project, row.threadId, { ...(optionId ? { optionId } : {}), text: message });
      return api.submit(repo, project, { scope: 'thread', threadId: row.threadId });
    },
    onSettled: () => void qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === repo && q.queryKey[2] === project }),
  });
  const working = row.status === 'with_claude';
  return (
    <div data-testid="no-mockup" className="mt-3 rounded-[10px] border-[0.5px] border-separator bg-cell px-4 py-3">
      <p className="text-[13px] font-medium">No mockup yet.</p>
      {row.body && (
        <div className="doc mt-2 text-[13px]">
          <Markdown remarkPlugins={[remarkGfm]}>{row.body}</Markdown>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button disabled={working || ask.isPending} onClick={() => ask.mutate()}>
          Ask Claude for a mockup
        </Button>
        {working && <span className="text-[12px] text-ink-3">Claude is working on it.</span>}
      </div>
      {(ask.data || ask.error) && (
        <p role="status" data-testid="send-notice" className={`mt-2 text-[12.5px] ${ask.error ? 'text-seal' : 'text-ink-2'}`}>
          {ask.error ? (ask.error as Error).message : ask.data?.message}
        </p>
      )}
    </div>
  );
}

/** The selected UI item: toolbar, the mockup, its pins, or "No mockup yet." */
function ScreenView({ screen, pins, repo, project, typeId }: { screen: UiScreen; pins: TypeItemRow[]; repo: string; project: string; typeId: string }) {
  const { row, mockup, problems } = screen;
  const navigate = useNavigate();
  const [device, setDevice] = useState<Device>(() => (window.innerWidth < 768 ? 'mobile' : 'desktop'));
  const [side, setSide] = useState<Side>(mockup?.after || !mockup?.before ? 'after' : 'before');
  const [pinMode, setPinMode] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const hasMarkup = Boolean(mockup?.after || mockup?.before);
  const markup = side === 'after' ? mockup?.after : mockup?.before;
  const kit = useQuery({ queryKey: ['mockupKit', repo, project, row.id], queryFn: () => api.mockupKit(repo, project, row.id), enabled: hasMarkup });
  const sidePins = pins.filter((r) => (r.anchor?.side ?? 'after') === side);
  // A pin's marker colour is its thread's status, as StatusMark shows it.
  const framePins: FramePin[] = sidePins.map((r, i) => ({ id: r.id, selector: r.anchor?.ref ?? '', n: i + 1, tone: toneOf([r.status]) }));
  const thread = (threadId: string) => ({ to: '/p/$repo/$project/th/$thread', params: { repo, project, thread: threadId } }) as const;

  useEffect(() => {
    setPinMode(false);
    setMissing([]);
  }, [side]);
  useEffect(() => {
    if (!pinMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pinMode]);

  const openPin = (id: string) => {
    const pin = sidePins.find((r) => r.id === id);
    if (pin) void navigate(thread(pin.threadId));
  };

  return (
    <section aria-label={row.title} className="min-w-0" data-testid="mockup-screen">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h3 className="text-[15px] font-semibold">{row.title}</h3>
        <StatusMark status={row.status} />
        <Link {...thread(row.threadId)} className="text-[12px] text-slate">
          Open thread
        </Link>
      </div>
      <p className="mt-0.5 text-[12.5px] text-ink-2">{row.summary}</p>
      {!hasMarkup && problems.length > 0 ? (
        <DataProblem title={row.title} problems={problems} data={row.data} threadId={row.threadId} repo={repo} project={project} />
      ) : !hasMarkup || !mockup ? (
        <NoMockup row={row} repo={repo} project={project} />
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="w-[170px]">
              <Segmented<Device> label="Device" value={device} onChange={setDevice} options={[{ value: 'desktop', label: 'Desktop' }, { value: 'mobile', label: 'Mobile' }]} />
            </div>
            <div className="w-[150px]">
              <Segmented<Side> label="Version" value={side} onChange={setSide} options={[{ value: 'before', label: 'Before', disabled: !mockup.before }, { value: 'after', label: 'After' }]} />
            </div>
            {pinMode ? (
              <Button onClick={() => setPinMode(false)}>Cancel</Button>
            ) : (
              <Button
                disabled={!markup}
                onClick={() => {
                  setAnchor(null);
                  setPinMode(true);
                }}
              >
                + Pin
              </Button>
            )}
          </div>
          <p data-testid="mockup-location" className="mt-2 break-all font-mono text-[11px] text-ink-3">
            {[mockup.route, mockup.files.join(', '), mockup.kit].filter(Boolean).join(' · ')}
          </p>
          {kit.data?.warnings.length ? (
            <ul data-testid="kit-warnings" className="mt-1 text-[11.5px] text-amber">
              {kit.data.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          {problems.length > 0 && (
            <ul data-testid="mockup-problems" className="mt-1 text-[11.5px] text-amber">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
          {pinMode && (
            <p role="status" className="mt-2 text-[12.5px] text-ink-2">
              Click the part of the mockup you want to ask about.
            </p>
          )}
          {anchor && (
            <div className="mt-3">
              <AnchorForm repo={repo} project={project} type={typeId} anchor={anchor} onDone={() => setAnchor(null)} />
            </div>
          )}
          {markup ? (
            <div className="mt-3">
              <MockupFrame
                key={`${side}:${hashOf(markup)}`}
                repo={repo}
                project={project}
                itemId={row.id}
                side={side}
                device={device}
                pins={framePins}
                pinMode={pinMode}
                onPicked={(pick) => {
                  setPinMode(false);
                  setAnchor({ itemId: row.id, kind: 'element', ref: pick.selector, label: pick.text, side });
                }}
                onOpenPin={openPin}
                onMissingPins={setMissing}
              />
            </div>
          ) : (
            <NoMockup row={row} repo={repo} project={project} />
          )}
          {sidePins.length > 0 && (
            <section aria-label="Pins" className="mt-4">
              <h4 className="mb-1.5 ml-0.5 text-[12px] font-semibold text-ink-3">Pins</h4>
              <ol className={LIST}>
                {sidePins.map((r, i) => (
                  <li key={r.id} data-testid="mockup-pin" className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
                    <span className="w-4 shrink-0 text-right font-mono text-[11px] text-ink-3">{i + 1}</span>
                    <StatusMark status={r.status} />
                    <Link {...thread(r.threadId)} className="min-w-0 flex-1 truncate font-medium">
                      {r.title}
                    </Link>
                    {missing.includes(r.id) && <span className="shrink-0 text-[11.5px] text-amber">Not in this version</span>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </section>
  );
}

/**
 * UI changes: the screens on the left (on top on phones), and one large mockup of the selected screen (`?item=`).
 * VisualScreen already shows the type's title and item count, so this starts with the screens.
 */
export function MockupsScreen({ repo, project, data, item }: ScreenProps) {
  const screens: UiScreen[] = data.items.filter((r) => !r.anchor).map((row) => ({ row, ...readMockup(row.data) }));
  const anchored = data.items.filter((r) => r.anchor);
  // A screen's pins: items of this type anchored to one of its elements, numbered in row order. A thin adapter over
  // anchorsOn, whose groups by element would number them by element instead.
  const pinsOn = (itemId: string) => {
    const on = new Set([...anchorsOn(anchored, itemId, 'element').values()].flat());
    return anchored.filter((r) => on.has(r));
  };
  const pins = screens.flatMap((s) => pinsOn(s.row.id));
  const selected = screens.find((s) => s.row.id === item) ?? screens.find((s) => s.mockup?.after || s.mockup?.before) ?? screens[0];
  // Other anchored items are listed below.
  const rest = selected ? anchored.filter((r) => !pins.includes(r)) : data.items;

  return (
    <div>
      {selected && (
        <div className="mt-4 grid grid-cols-1 gap-5 min-[1100px]:grid-cols-[240px_minmax(0,1fr)]">
          <nav aria-label="Screens" className="min-w-0">
            <div className={LIST}>
              {screens.map((s) => (
                <Link
                  key={s.row.id}
                  to="/p/$repo/$project/t/$type"
                  params={{ repo, project, type: data.type.id }}
                  search={{ item: s.row.id }}
                  aria-current={s.row.id === selected.row.id ? 'page' : undefined}
                  data-testid="mockup-item"
                  className={`flex items-start gap-2.5 px-3 py-2.5 hover:bg-selection ${s.row.id === selected.row.id ? 'bg-selection' : ''}`}
                >
                  <span className="mt-[3px]">
                    <StatusMark status={s.row.status} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium">{s.row.title}</span>
                    {s.mockup?.route && <span className="block truncate font-mono text-[11px] text-ink-3">{s.mockup.route}</span>}
                  </span>
                </Link>
              ))}
            </div>
          </nav>
          <ScreenView
            key={selected.row.id}
            screen={selected}
            pins={pinsOn(selected.row.id)}
            repo={repo}
            project={project}
            typeId={data.type.id}
          />
        </div>
      )}
      {rest.length > 0 && <OtherItems rows={rest} repo={repo} project={project} title="Other items" />}
    </div>
  );
}
