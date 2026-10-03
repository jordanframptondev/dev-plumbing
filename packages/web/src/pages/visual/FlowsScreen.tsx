import { parseData, type FlowData, type TypeItemRow } from '@dev-plumbing/core/schemas';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api } from '../../api/client';
import { Button } from '../../components/Button';
import { MockupFrame } from '../../components/MockupFrame';
import { Segmented } from '../../components/Segmented';
import { StatusMark } from '../../components/StatusMark';
import type { Tone } from '../../diagram/DiagramView';
import { SequenceView } from '../../diagram/SequenceView';
import { AnchorForm } from './AnchorForm';
import { DataProblem } from './DataProblem';
import { OtherItems } from './OtherItems';
import { anchorsOn, bubblesFrom, useShowWhenNarrow, useWide } from './rows';
import type { ScreenProps } from './VisualScreen';

type Step = FlowData['steps'][number];
type Bubbles = Record<number, { count: number; tone: Tone }>;
/** A UI item a flow step can show: its type, title and thread, and whether it has After markup. */
export type MockupRef = { typeId: string; title: string; threadId: string; hasAfter: boolean };
type FlowViewProps = {
  flow: FlowData;
  repo: string;
  project: string;
  selected?: number | null;
  onSelect?: (n: number) => void;
  bubbles?: Bubbles;
  /** The selected step's panel. Below 1100 px a storyboard opens it inside the tapped card; otherwise it follows the drawing. */
  panel?: ReactNode;
};

const KIND_TAG: Record<FlowData['kind'], string> = { user: 'User flow', system: 'System flow', both: 'User and system' };
/** The step a pin is about. Step anchors keep the step number as text. */
const stepOf = (pin: TypeItemRow) => Number(pin.anchor?.ref);

/**
 * One bubble per step: how many threads are about it, in the colour of the most urgent one. A thin adapter over the
 * shared anchorsOn and bubblesFrom, which key by anchor.ref; steps key by number.
 */
function stepBubbles(itemId: string, pins: TypeItemRow[]): Bubbles {
  return Object.fromEntries(Object.entries(bubblesFrom(anchorsOn(pins, itemId, 'step'))).map(([ref, bubble]) => [Number(ref), bubble]));
}

/** The project's UI items by id. Storyboards and the thread view use it to find a step's mockup. */
export function useMockupItems(repo: string, project: string): Map<string, MockupRef> {
  const home = useQuery({ queryKey: ['projectHome', repo, project], queryFn: () => api.projectHome(repo, project) });
  const types = (home.data?.types ?? []).filter((t) => t.screen === 'mockups' && t.itemCount > 0);
  const lists = useQueries({
    queries: types.map((t) => ({ queryKey: ['typeItems', repo, project, t.id], queryFn: () => api.typeItems(repo, project, t.id) })),
  });
  const refs = new Map<string, MockupRef>();
  lists.forEach((q, i) => {
    for (const row of q.data?.items ?? []) {
      const parsed = parseData('mockups', row.data);
      refs.set(row.id, { typeId: types[i]!.id, title: row.title, threadId: row.threadId, hasAfter: parsed.ok && Boolean(parsed.data.after?.trim()) });
    }
  });
  return refs;
}

/** User flows: one card per step, with the step's After mockup as a thumbnail when it has one. */
function Storyboard({ flow, repo, project, selected = null, onSelect, bubbles, panel }: FlowViewProps) {
  const mockups = useMockupItems(repo, project);
  const steps = [...flow.steps].sort((a, b) => a.n - b.n);
  // One column on a phone, at most two from 768 to 1099 px (§16), then as many cards of 220 px or more as fit.
  return (
    <ol data-testid="storyboard" className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 min-[1100px]:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
      {steps.map((s) => {
        const screen = s.mockupId ? mockups.get(s.mockupId) : undefined;
        const bubble = bubbles?.[s.n];
        const on = selected === s.n;
        const head = (
          <>
            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[0.5px] border-ink-3 text-[11px] font-semibold text-ink-2">{s.n}</span>
            <span className="min-w-0 flex-1 text-[13px] font-medium leading-snug">{s.label}</span>
            {bubble && (
              <span
                data-testid="step-bubble"
                className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-canvas"
                style={{ background: `var(--${bubble.tone})` }}
              >
                {bubble.count}
              </span>
            )}
          </>
        );
        return (
          <li
            key={s.n}
            data-testid="story-step"
            data-step={s.n}
            className={`min-w-0 rounded-[10px] border-[0.5px] bg-cell p-3 ${on ? 'border-slate' : 'border-separator'}`}
          >
            {onSelect ? (
              <button type="button" aria-pressed={on} aria-label={`Step ${s.n}: ${s.label}`} onClick={() => onSelect(s.n)} className="flex w-full items-start gap-2 text-left">
                {head}
              </button>
            ) : (
              <div className="flex items-start gap-2">{head}</div>
            )}
            {s.mockupId && screen?.hasAfter && (
              // The frame is drawn at phone width and scaled down; long screens are cut, not stretched.
              <div className="mt-2 max-h-[260px] overflow-hidden rounded-[8px] border-[0.5px] border-separator">
                <MockupFrame repo={repo} project={project} itemId={s.mockupId} side="after" device="mobile" thumbnail />
              </div>
            )}
            {s.mockupId && screen && (
              <Link
                to="/p/$repo/$project/t/$type"
                params={{ repo, project, type: screen.typeId }}
                search={{ item: s.mockupId }}
                className="mt-1.5 block truncate text-[12px] text-slate"
              >
                {screen.title}
              </Link>
            )}
            {s.systemNote && <p className="mt-1.5 text-[12px] text-ink-3">{s.systemNote}</p>}
            {on && panel}
          </li>
        );
      })}
    </ol>
  );
}

/** A flow drawn for its kind: a storyboard, a sequence, or both with a switch. The numbers match in both. */
export function FlowView(p: FlowViewProps) {
  const [view, setView] = useState<'storyboard' | 'sequence'>('storyboard');
  const shown = p.flow.kind === 'both' ? view : p.flow.kind === 'system' ? 'sequence' : 'storyboard';
  // Below 1100 px a storyboard's panel opens right under the tapped card, not after every card. A sequence's follows it.
  const wide = useWide();
  const inCard = shown === 'storyboard' && !wide;
  return (
    <div data-testid="flow-view">
      {p.flow.kind === 'both' && (
        <div className="mb-3 max-w-xs">
          <Segmented
            label="Show the flow as"
            value={view}
            onChange={setView}
            options={[
              { value: 'storyboard', label: 'Storyboard' },
              { value: 'sequence', label: 'Sequence' },
            ]}
          />
        </div>
      )}
      {shown === 'sequence' ? <SequenceView flow={p.flow} selected={p.selected} onSelect={p.onSelect} bubbles={p.bubbles} /> : <Storyboard {...p} panel={inCard ? p.panel : undefined} />}
      {!inCard && p.panel}
    </div>
  );
}

function StepPanel({ row, flow, step, pins, typeId, repo, project }: { row: TypeItemRow; flow: FlowData; step: Step; pins: TypeItemRow[]; typeId: string; repo: string; project: string }) {
  const [asking, setAsking] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useShowWhenNarrow(panel);
  const screen = useMockupItems(repo, project).get(step.mockupId ?? '');
  const lane = (id?: string) => (id === undefined ? undefined : (flow.lanes?.find((l) => l.id === id)?.label ?? id));
  const from = lane(step.from);
  const to = lane(step.to);
  const lanes = from && to && from !== to ? `${from} → ${to}` : (from ?? to);
  return (
    <div ref={panel} data-testid="step-panel" className="mt-3 border-l-2 border-separator pl-3">
      <p className="text-[11px] font-semibold text-ink-3">
        Step {step.n}
        {lanes ? ` · ${lanes}` : ''}
      </p>
      <p className="mt-0.5 text-[13.5px] font-semibold">{step.label}</p>
      {step.systemNote && <p className="mt-0.5 text-[12.5px] text-ink-3">{step.systemNote}</p>}
      {step.mockupId && screen && (
        <p className="mt-1 text-[12.5px]">
          <span className="text-ink-3">Screen </span>
          <Link to="/p/$repo/$project/t/$type" params={{ repo, project, type: screen.typeId }} search={{ item: step.mockupId }} className="text-slate">
            {screen.title}
          </Link>
        </p>
      )}
      {pins.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-[12.5px]">
          {pins.map((pin) => (
            <li key={pin.id} className="flex items-center gap-2">
              <StatusMark status={pin.status} />
              <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: pin.threadId }} className="min-w-0 truncate text-slate">
                {pin.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {asking ? (
        <AnchorForm
          repo={repo}
          project={project}
          type={typeId}
          anchor={{ itemId: row.id, kind: 'step', ref: String(step.n), label: `Step ${step.n}: ${step.label}` }}
          onDone={() => setAsking(false)}
        />
      ) : (
        <Button className="mt-3" onClick={() => setAsking(true)}>
          Ask about this step
        </Button>
      )}
    </div>
  );
}

function FlowSection({ row, flow, pins, typeId, repo, project, highlighted }: { row: TypeItemRow; flow: FlowData; pins: TypeItemRow[]; typeId: string; repo: string; project: string; highlighted: boolean }) {
  const [picked, setPicked] = useState<number | null>(null);
  const numbers = new Set(flow.steps.map((s) => s.n));
  const here = pins.filter((p) => numbers.has(stepOf(p)));
  // Claude may renumber or drop steps. Their threads stay listed, marked as gone.
  const gone = pins.filter((p) => !numbers.has(stepOf(p)));
  const step = flow.steps.find((s) => s.n === picked);
  return (
    <section
      id={`flow-${row.id}`}
      data-testid="flow"
      data-item={row.id}
      data-selected={highlighted ? 'true' : undefined}
      className={`mt-7 ${highlighted ? 'border-l-2 border-slate pl-3' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-[15px] font-semibold">{row.title}</h3>
        <span className="text-[11.5px] text-ink-3">{KIND_TAG[flow.kind]}</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[12px]">
          <StatusMark status={row.status} />
          <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: row.threadId }} className="text-slate">
            Open thread
          </Link>
        </span>
      </div>
      <p className="mt-0.5 text-[12.5px] text-ink-3">{row.summary}</p>
      <div className="mt-3">
        <FlowView
          flow={flow}
          repo={repo}
          project={project}
          selected={picked}
          onSelect={(n) => setPicked((cur) => (cur === n ? null : n))}
          bubbles={stepBubbles(row.id, here)}
          panel={step && <StepPanel key={step.n} row={row} flow={flow} step={step} pins={here.filter((p) => stepOf(p) === step.n)} typeId={typeId} repo={repo} project={project} />}
        />
      </div>
      {gone.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-[12.5px]">
          {gone.map((pin) => (
            <li key={pin.id} className="flex items-center gap-2">
              <StatusMark status={pin.status} />
              <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: pin.threadId }} className="min-w-0 truncate text-slate">
                {pin.title}
              </Link>
              <span className="shrink-0 text-[11.5px] text-ink-3">Not in this version</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Flows: each flow drawn for its kind, with a panel per step and bubbles for the threads about each step.
 * `item` (`?item=`) opens one flow. VisualScreen already shows the type's title and item count.
 */
export function FlowsScreen({ repo, project, data, item: target }: ScreenProps) {
  const { type, items } = data;
  const drawn: { row: TypeItemRow; flow: FlowData }[] = [];
  const broken: { row: TypeItemRow; problems: string[] }[] = [];
  const other: TypeItemRow[] = [];
  const pins: TypeItemRow[] = [];
  for (const row of items) {
    if (row.anchor?.kind === 'step') pins.push(row);
    else if (row.data === null) other.push(row);
    else {
      const parsed = parseData('flows', row.data);
      if (parsed.ok) drawn.push({ row, flow: parsed.data });
      else broken.push({ row, problems: parsed.problems });
    }
  }
  const drawnIds = new Set(drawn.map((d) => d.row.id));
  // A pin whose flow can't be drawn has nowhere to show, so it's listed with the other items.
  const unplaced = pins.filter((p) => !drawnIds.has(p.anchor!.itemId));

  // ?item= opens one flow: scroll to it. Its section is outlined.
  useEffect(() => {
    if (target) document.getElementById(`flow-${target}`)?.scrollIntoView({ block: 'start' });
  }, [target]);

  return (
    <div>
      {drawn.map(({ row, flow }) => (
        <FlowSection
          key={row.id}
          row={row}
          flow={flow}
          pins={pins.filter((p) => p.anchor!.itemId === row.id)}
          typeId={type.id}
          repo={repo}
          project={project}
          highlighted={row.id === target}
        />
      ))}
      {broken.map(({ row, problems }) => (
        <div key={row.id} className="mt-7">
          <DataProblem title={row.title} problems={problems} data={row.data} threadId={row.threadId} repo={repo} project={project} />
        </div>
      ))}
      {other.length + unplaced.length > 0 && <OtherItems rows={[...other, ...unplaced]} repo={repo} project={project} />}
    </div>
  );
}
