import type { FlowData, NodeStatus } from '@dev-plumbing/core/schemas';
import { useId, type KeyboardEvent, type ReactNode } from 'react';
import type { Tone } from './DiagramView';
import { ROW_H, sequenceLayout } from './sequenceLayout';

const STROKE: Record<NodeStatus, string> = { new: 'var(--moss)', changed: 'var(--amber)', unchanged: 'var(--mist)', external: 'var(--mist)' };

type Step = FlowData['steps'][number];

/**
 * A system flow as a sequence diagram: one column per lane, one numbered row per step, where sequenceLayout puts them.
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
  const layout = sequenceLayout(flow);
  const { width, height } = layout;
  // The flow's own lanes and steps, in the layout's order, for their full labels and notes.
  const lanes = flow.lanes ?? [];
  const steps = [...flow.steps].sort((a, b) => a.n - b.n);

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

        {layout.lanes.map((l, i) => {
          const x = l.x - l.headW / 2;
          return (
            <g key={l.id} data-testid="sequence-lane" data-lane={l.id} data-status={l.status}>
              <title>{lanes[i]!.label}</title>
              <line x1={l.x} y1={l.lifeTop} x2={l.x} y2={l.lifeBottom} strokeDasharray="4 4" style={{ stroke: 'var(--mist)' }} />
              <rect
                x={x}
                y={l.headY}
                width={l.headW}
                height={l.headH}
                rx={6}
                strokeDasharray={l.status === 'external' ? '4 3' : undefined}
                style={{ fill: 'var(--cell)', stroke: STROKE[l.status], strokeWidth: 1 }}
              />
              <text x={l.x} y={l.headY + l.headH / 2 + 4} textAnchor="middle" fontSize={12.5} style={{ fill: 'var(--text)' }}>
                {l.label}
              </text>
            </g>
          );
        })}

        {layout.steps.map((shape, k) => {
          const s = steps[k]!;
          const { y, top } = shape;
          const on = selected === s.n;
          const line = { stroke: on ? 'var(--slate)' : 'var(--text-3)', strokeWidth: on ? 2 : 1, fill: 'none' };
          const marker = `url(#${uid}-${on ? 'selected' : 'plain'})`;
          const textStyle = { fill: shape.shape === 'note' ? 'var(--text-2)' : 'var(--text)', fontWeight: on ? 600 : 400 };
          let drawing: ReactNode;
          let start: { x: number; y: number };
          if (shape.shape === 'arrow') {
            drawing = (
              <>
                <path d={`M${shape.x1},${y} H${shape.x2}`} markerEnd={marker} style={line} />
                <text x={shape.labelX} y={shape.labelY} textAnchor="middle" fontSize={12} style={textStyle}>
                  {shape.label}
                </text>
              </>
            );
            start = { x: shape.x1 + Math.sign(shape.x2 - shape.x1) * 12, y };
          } else if (shape.shape === 'loop') {
            const reach = shape.x2 - shape.x1;
            drawing = (
              <>
                <path d={`M${shape.x1},${y - 8} h${reach} v16 h${-reach}`} markerEnd={marker} style={line} />
                <text x={shape.labelX} y={shape.labelY} textAnchor={shape.anchor} fontSize={12} style={textStyle}>
                  {shape.label}
                </text>
              </>
            );
            start = { x: shape.x1, y: y - 8 };
          } else {
            drawing = (
              <text x={shape.labelX} y={shape.labelY} textAnchor="middle" fontSize={12} style={textStyle}>
                {shape.label}
              </text>
            );
            start = { x: shape.x1 + 8, y: y - 4 };
          }
          const bubble = bubbles?.[s.n];
          return (
            <g key={s.n} data-testid="sequence-step" data-step={s.n} data-shape={shape.shape} {...asButton(s, on)}>
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
