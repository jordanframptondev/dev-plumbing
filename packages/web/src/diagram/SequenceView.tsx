import type { FlowData, NodeStatus } from '@dev-plumbing/core/schemas';
import { useId, type KeyboardEvent, type ReactNode } from 'react';
import type { Tone } from './DiagramView';

// Layout, in SVG units. Lanes are columns; steps are rows under the lane headers, in step order.
const LANE_W = 160;
const GAP = 24;
const PAD = 16;
const HEAD_H = 32;
const TOP = PAD + HEAD_H + 20;
const ROW_H = 44;
const LOOP_W = 28;
/** Roughly one character of 12 px text, to cut labels that wouldn't fit. */
const CHAR_W = 6.5;

const STROKE: Record<NodeStatus, string> = { new: 'var(--moss)', changed: 'var(--amber)', unchanged: 'var(--mist)', external: 'var(--mist)' };

type Step = FlowData['steps'][number];
type Shape = { kind: 'arrow'; from: number; to: number } | { kind: 'loop'; x: number } | { kind: 'note' };

const clip = (text: string, room: number) => {
  const max = Math.max(4, Math.floor(room / CHAR_W));
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/**
 * A system flow as a sequence diagram: one column per lane, one numbered row per step.
 * A step between two lanes is an arrow. A step on one lane (or with only one end) is a small loop.
 * A step with no lanes is a note across the whole width.
 */
export function SequenceView({
  flow,
  selected = null,
  onSelect,
  bubbles,
}: {
  flow: FlowData;
  selected?: number | null;
  onSelect?: (n: number) => void;
  bubbles?: Record<number, { count: number; tone: Tone }>;
}) {
  // Marker ids must be unique per drawing and safe inside url(#…).
  const uid = `dp-seq-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const lanes = flow.lanes ?? [];
  const columns = Math.max(lanes.length, 1);
  const width = PAD * 2 + columns * LANE_W + (columns - 1) * GAP;
  const steps = [...flow.steps].sort((a, b) => a.n - b.n);
  const height = TOP + steps.length * ROW_H + PAD;
  const centre = new Map(lanes.map((l, i) => [l.id, PAD + i * (LANE_W + GAP) + LANE_W / 2]));

  const shapeOf = (s: Step): Shape => {
    const a = s.from === undefined ? undefined : centre.get(s.from);
    const b = s.to === undefined ? undefined : centre.get(s.to);
    if (a === undefined && b === undefined) return { kind: 'note' };
    if (a === undefined || b === undefined || a === b) return { kind: 'loop', x: a ?? b ?? PAD };
    return { kind: 'arrow', from: a, to: b };
  };

  const asButton = (s: Step, on: boolean) =>
    onSelect
      ? {
          role: 'button',
          tabIndex: 0,
          'aria-label': `Step ${s.n}: ${s.label}`,
          'aria-pressed': on,
          className: 'group cursor-pointer outline-none',
          onClick: () => onSelect(s.n),
          onKeyDown: (e: KeyboardEvent<SVGGElement>) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(s.n);
            }
          },
        }
      : {};

  return (
    <figure data-testid="sequence" className="m-0">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        className="block h-auto"
        style={{ maxWidth: width, touchAction: 'pan-x pan-y pinch-zoom' }}
        role="group"
        aria-label={`Sequence of ${steps.length} step${steps.length === 1 ? '' : 's'}`}
      >
        <defs>
          {(['plain', 'selected'] as const).map((v) => (
            <marker key={v} id={`${uid}-${v}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 z" style={{ fill: v === 'selected' ? 'var(--slate)' : 'var(--text-3)' }} />
            </marker>
          ))}
        </defs>

        {lanes.map((l, i) => {
          const x = PAD + i * (LANE_W + GAP);
          const c = x + LANE_W / 2;
          return (
            <g key={l.id} data-testid="sequence-lane" data-lane={l.id} data-status={l.status}>
              <title>{l.label}</title>
              <line x1={c} y1={PAD + HEAD_H} x2={c} y2={height - PAD} strokeDasharray="4 4" style={{ stroke: 'var(--mist)' }} />
              <rect
                x={x}
                y={PAD}
                width={LANE_W}
                height={HEAD_H}
                rx={6}
                strokeDasharray={l.status === 'external' ? '4 3' : undefined}
                style={{ fill: 'var(--cell)', stroke: STROKE[l.status], strokeWidth: 1 }}
              />
              <text x={c} y={PAD + HEAD_H / 2 + 4} textAnchor="middle" fontSize={12.5} style={{ fill: 'var(--text)' }}>
                {clip(l.label, LANE_W - 16)}
              </text>
            </g>
          );
        })}

        {steps.map((s, k) => {
          const top = TOP + k * ROW_H;
          const y = top + 30;
          const shape = shapeOf(s);
          const on = selected === s.n;
          const line = { stroke: on ? 'var(--slate)' : 'var(--text-3)', strokeWidth: on ? 2 : 1, fill: 'none' };
          const marker = `url(#${uid}-${on ? 'selected' : 'plain'})`;
          const text = `${s.n}. ${s.label}`;
          const textStyle = { fill: shape.kind === 'note' ? 'var(--text-2)' : 'var(--text)', fontWeight: on ? 600 : 400 };
          let drawing: ReactNode;
          let start: { x: number; y: number };
          if (shape.kind === 'arrow') {
            const span = Math.abs(shape.to - shape.from);
            drawing = (
              <>
                <path d={`M${shape.from},${y} H${shape.to}`} markerEnd={marker} style={line} />
                <text x={Math.min(shape.from, shape.to) + span / 2} y={top + 18} textAnchor="middle" fontSize={12} style={textStyle}>
                  {clip(text, span + LANE_W - 24)}
                </text>
              </>
            );
            start = { x: shape.from + Math.sign(shape.to - shape.from) * 12, y };
          } else if (shape.kind === 'loop') {
            // The label goes on whichever side of the lane has more room.
            const right = width - PAD - (shape.x + LOOP_W + 6);
            const left = shape.x - PAD - 6;
            const onRight = right >= left;
            drawing = (
              <>
                <path d={`M${shape.x},${y - 8} h${LOOP_W} v16 h${-LOOP_W}`} markerEnd={marker} style={line} />
                <text x={onRight ? shape.x + LOOP_W + 6 : shape.x - 6} y={y + 4} textAnchor={onRight ? 'start' : 'end'} fontSize={12} style={textStyle}>
                  {clip(text, Math.max(right, left))}
                </text>
              </>
            );
            start = { x: shape.x, y: y - 8 };
          } else {
            drawing = (
              <text x={width / 2} y={y} textAnchor="middle" fontSize={12} style={textStyle}>
                {clip(text, width - PAD * 2)}
              </text>
            );
            start = { x: PAD + 8, y: y - 4 };
          }
          const bubble = bubbles?.[s.n];
          return (
            <g key={s.n} data-testid="sequence-step" data-step={s.n} data-shape={shape.kind} {...asButton(s, on)}>
              <title>{s.systemNote ? `${s.label} (${s.systemNote})` : s.label}</title>
              {onSelect && <rect x={0} y={top} width={width} height={ROW_H} rx={6} fill="transparent" className="group-focus-visible:stroke-slate" />}
              {drawing}
              {bubble && (
                <g data-testid="sequence-bubble">
                  <circle cx={start.x} cy={start.y} r={8} style={{ fill: `var(--${bubble.tone})` }} />
                  <text x={start.x} y={start.y + 3.5} textAnchor="middle" fontSize={10} fontWeight={600} style={{ fill: 'var(--canvas)' }}>
                    {bubble.count}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
