import type { DiagramData, NodeStatus } from '@dev-plumbing/core/schemas';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { layoutDiagram, type DiagramLayout, type Direction } from './layout';

/** StatusMark colours: your turn, draft or with Claude, resolved, parked. */
export type Tone = 'seal' | 'slate' | 'moss' | 'mist';

// §16: box new / changed / unchanged / external is moss / amber / mist / dashed mist.
const STROKE: Record<NodeStatus, string> = { new: 'var(--moss)', changed: 'var(--amber)', unchanged: 'var(--mist)', external: 'var(--mist)' };
/** Narrower than this, diagrams run top to bottom. */
const NARROW = 640;

/** Cuts text to fit a box: labels keep their start, file paths keep their end. */
function fit(text: string, chars: number, keep: 'start' | 'end'): string {
  if (text.length <= chars) return text;
  const room = Math.max(1, chars - 1);
  return keep === 'start' ? `${text.slice(0, room)}…` : `…${text.slice(-room)}`;
}

const pathOf = (points: { x: number; y: number }[]) => points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

type Drawn = { key: string; layout: DiagramLayout } | { key: string; error: string };

/**
 * One diagram, laid out with ELK and drawn as SVG in Ink wash. It fits its container's width (and pinch-zooms on phones),
 * and runs top to bottom when the container is narrow.
 */
export function DiagramView({
  data,
  checks,
  bubbles,
  selected,
  onSelect,
  compact,
  legend = false,
}: {
  data: DiagramData;
  checks?: Record<string, boolean>;
  bubbles?: Record<string, { count: number; tone: Tone }>;
  selected?: string | null;
  onSelect?: (nodeId: string) => void;
  compact?: boolean;
  legend?: boolean;
}) {
  const box = useRef<HTMLElement>(null);
  const [direction, setDirection] = useState<Direction>('RIGHT');
  const [drawn, setDrawn] = useState<Drawn | null>(null);
  const arrow = `dp-arrow-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  // Data is compared by value, so a refetch that changes nothing doesn't lay out again.
  const key = `${direction}|${JSON.stringify(data)}`;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const pick = (width: number) => setDirection(width > 0 && width < NARROW ? 'DOWN' : 'RIGHT');
    pick(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => pick(entries[0]?.contentRect.width ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let live = true;
    layoutDiagram(data, direction).then(
      (layout) => live && setDrawn({ key, layout }),
      (e: unknown) => live && setDrawn({ key, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
    // `key` stands for data and direction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const interactive = !compact && Boolean(onSelect);
  const keyDown = (e: KeyboardEvent<SVGGElement>, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(id);
    }
  };
  const labelSize = compact ? 11.5 : 12.5;

  return (
    <figure ref={box} data-testid="diagram" className="m-0 min-w-0">
      {drawn && 'error' in drawn ? (
        <div className="py-4 text-[13px] text-ink-2">
          This item's drawing couldn't be shown
          <p className="mt-1 text-[12px] text-ink-3">{drawn.error}</p>
        </div>
      ) : !drawn ? (
        <p className="py-6 text-[12.5px] text-ink-3">Drawing…</p>
      ) : (
        <svg
          viewBox={`0 0 ${drawn.layout.width} ${drawn.layout.height}`}
          width="100%"
          className="block"
          style={{ touchAction: 'pinch-zoom', maxHeight: compact ? 360 : undefined }}
        >
          <defs>
            <marker id={arrow} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,1 L9,5 L0,9 z" style={{ fill: 'var(--text-3)' }} />
            </marker>
          </defs>
          {drawn.layout.groups.map((g) => (
            <g key={g.id} data-testid="diagram-group" data-group={g.id}>
              <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={10} style={{ fill: 'none', stroke: 'var(--separator)', strokeWidth: 1 }} />
              <text x={g.x + 12} y={g.y + 18} style={{ fill: 'var(--text-3)', fontSize: 11, fontWeight: 600 }}>
                {fit(g.label, Math.floor((g.w - 24) / 6.2), 'start')}
              </text>
            </g>
          ))}
          {drawn.layout.edges
            .filter((e) => e.points.length >= 2)
            .map((e) => (
              <g key={e.id}>
                <path
                  data-testid="diagram-edge"
                  data-edge={e.id}
                  d={pathOf(e.points)}
                  markerEnd={`url(#${arrow})`}
                  style={{ fill: 'none', stroke: 'var(--text-3)', strokeWidth: 1, strokeDasharray: e.dashed ? '4 3' : undefined }}
                />
                {e.label && (
                  <text
                    x={e.labelX}
                    y={e.labelY + 3.5}
                    textAnchor="middle"
                    style={{ fill: 'var(--text-3)', fontSize: 10.5, paintOrder: 'stroke', stroke: 'var(--canvas)', strokeWidth: 3, strokeLinejoin: 'round' }}
                  >
                    {e.label}
                  </text>
                )}
              </g>
            ))}
          {drawn.layout.nodes.map((n) => {
            const isSelected = interactive && selected === n.id;
            const check = checks?.[n.id];
            const bubble = compact ? undefined : bubbles?.[n.id];
            const pathRoom = Math.floor((n.w - 16) / 6.3) - (check === false ? 10 : check === true ? 2 : 0);
            return (
              <g
                key={n.id}
                data-testid="diagram-node"
                data-node={n.id}
                data-status={n.status}
                {...(interactive
                  ? {
                      role: 'button',
                      tabIndex: 0,
                      'aria-label': `${n.label}, ${n.status}`,
                      'aria-pressed': isSelected,
                      onClick: () => onSelect?.(n.id),
                      onKeyDown: (e: KeyboardEvent<SVGGElement>) => keyDown(e, n.id),
                      style: { cursor: 'pointer' },
                    }
                  : {})}
              >
                <title>{n.path ? `${n.label}\n${n.path}` : n.label}</title>
                <rect
                  data-part="box"
                  x={n.x}
                  y={n.y}
                  width={n.w}
                  height={n.h}
                  rx={6}
                  style={{
                    fill: 'var(--cell)',
                    stroke: isSelected ? 'var(--slate)' : STROKE[n.status],
                    strokeWidth: isSelected ? 2 : 1,
                    strokeDasharray: n.status === 'external' ? '4 3' : undefined,
                  }}
                />
                <text x={n.x + n.w / 2} y={n.path ? n.y + 21 : n.y + n.h / 2 + 4.5} textAnchor="middle" style={{ fill: 'var(--text)', fontSize: labelSize, fontWeight: 500 }}>
                  {fit(n.label, Math.floor((n.w - 16) / (labelSize * 0.56)), 'start')}
                </text>
                {n.path && (
                  <text x={n.x + n.w / 2} y={n.y + 38} textAnchor="middle" className="font-mono" style={{ fill: 'var(--text-3)', fontSize: 10.5 }}>
                    {fit(n.path, pathRoom, 'end')}
                    {check === true && (
                      <tspan data-check="found" style={{ fill: 'var(--moss)' }}>
                        {' ✓'}
                      </tspan>
                    )}
                    {check === false && (
                      <tspan data-check="missing" className="font-sans" style={{ fill: 'var(--amber)' }}>
                        {' not found'}
                      </tspan>
                    )}
                  </text>
                )}
                {bubble && (
                  <g data-testid="diagram-bubble" data-count={bubble.count} data-tone={bubble.tone}>
                    <circle cx={n.x + n.w} cy={n.y} r={8} style={{ fill: `var(--${bubble.tone})`, stroke: `var(--${bubble.tone})` }} />
                    <text
                      x={n.x + n.w}
                      y={n.y + 3.5}
                      textAnchor="middle"
                      style={{ fill: bubble.tone === 'mist' ? 'var(--text)' : 'var(--canvas)', fontSize: 10, fontWeight: 600 }}
                    >
                      {bubble.count > 9 ? '9+' : bubble.count}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {legend && drawn && 'layout' in drawn && <Legend />}
    </figure>
  );
}

const LEGEND: { status: NodeStatus; text: string }[] = [
  { status: 'new', text: 'new' },
  { status: 'changed', text: 'changed' },
  { status: 'unchanged', text: 'unchanged' },
  { status: 'external', text: 'outside the repo' },
];

/** One small line under a full-size diagram: a swatch per box status, outlined like the boxes, never filled. */
function Legend() {
  return (
    <figcaption data-testid="diagram-legend" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
      {LEGEND.map((l) => (
        <span key={l.status} data-status={l.status} className="inline-flex items-center gap-1">
          <svg width="14" height="10" aria-hidden="true" className="shrink-0">
            <rect
              data-part="swatch"
              x={0.5}
              y={0.5}
              width={13}
              height={9}
              rx={2}
              style={{ fill: 'none', stroke: STROKE[l.status], strokeWidth: 1, strokeDasharray: l.status === 'external' ? '3 2' : undefined }}
            />
          </svg>
          {l.text}
        </span>
      ))}
    </figcaption>
  );
}
