import type { FlowData, NodeStatus } from '@dev-plumbing/core/schemas';

// In SVG units. Lanes are columns; steps are rows under the lane headers, in step order.
const LANE_W = 160;
const GAP = 24;
const PAD = 16;
const HEAD_H = 32;
const TOP = PAD + HEAD_H + 20;
/** One step's row. */
export const ROW_H = 44;
/** How far a loop reaches out from its lane. */
const LOOP_W = 28;
/** Roughly one character of 12 px text, to cut labels that wouldn't fit. */
const CHAR_W = 6.5;

export type SequenceLayout = {
  width: number;
  height: number;
  /** In the flow's order. `x` is the lane's centre, where its lifeline runs; its head is `headW` wide, centred on `x`. */
  lanes: { id: string; label: string; status: NodeStatus; x: number; headY: number; headW: number; headH: number; lifeTop: number; lifeBottom: number }[];
  /**
   * In step order, one row each, from `top`. An arrow runs from x1 to x2 at y. A loop leaves x1 at y - 8, reaches out
   * to x2 and comes back at y + 8. A note is only its label, across x1 to x2. `label` is "<n>. <label>", cut to fit,
   * and sits at labelX, labelY with its `anchor`.
   */
  steps: {
    n: number;
    shape: 'arrow' | 'loop' | 'note';
    x1: number;
    x2: number;
    y: number;
    top: number;
    label: string;
    labelX: number;
    labelY: number;
    anchor: 'start' | 'middle' | 'end';
  }[];
};

const clip = (text: string, room: number) => {
  const max = Math.max(4, Math.floor(room / CHAR_W));
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/**
 * A system flow as a sequence diagram, laid out: one column per lane, one numbered row per step. A step between two
 * lanes is an arrow. A step on one lane (or with only one end) is a small loop. A step with no lanes is a note across
 * the whole width. Pure: the flows screen and the whiteboard draw from the same numbers.
 */
export function sequenceLayout(flow: FlowData): SequenceLayout {
  const lanes = flow.lanes ?? [];
  const columns = Math.max(lanes.length, 1);
  const width = PAD * 2 + columns * LANE_W + (columns - 1) * GAP;
  const steps = [...flow.steps].sort((a, b) => a.n - b.n);
  const height = TOP + steps.length * ROW_H + PAD;
  const centre = new Map(lanes.map((l, i) => [l.id, PAD + i * (LANE_W + GAP) + LANE_W / 2]));

  return {
    width,
    height,
    lanes: lanes.map((l) => ({
      id: l.id,
      label: clip(l.label, LANE_W - 16),
      status: l.status,
      x: centre.get(l.id)!,
      headY: PAD,
      headW: LANE_W,
      headH: HEAD_H,
      lifeTop: PAD + HEAD_H,
      lifeBottom: height - PAD,
    })),
    steps: steps.map((s, k) => {
      const top = TOP + k * ROW_H;
      const y = top + 30;
      const text = `${s.n}. ${s.label}`;
      const a = s.from === undefined ? undefined : centre.get(s.from);
      const b = s.to === undefined ? undefined : centre.get(s.to);
      if (a === undefined && b === undefined) {
        return { n: s.n, shape: 'note' as const, x1: PAD, x2: width - PAD, y, top, label: clip(text, width - PAD * 2), labelX: width / 2, labelY: y, anchor: 'middle' as const };
      }
      if (a === undefined || b === undefined || a === b) {
        const x = a ?? b ?? PAD;
        // The label goes on whichever side of the lane has more room.
        const right = width - PAD - (x + LOOP_W + 6);
        const left = x - PAD - 6;
        const onRight = right >= left;
        return {
          n: s.n,
          shape: 'loop' as const,
          x1: x,
          x2: x + LOOP_W,
          y,
          top,
          label: clip(text, Math.max(right, left)),
          labelX: onRight ? x + LOOP_W + 6 : x - 6,
          labelY: y + 4,
          anchor: onRight ? ('start' as const) : ('end' as const),
        };
      }
      const span = Math.abs(b - a);
      return { n: s.n, shape: 'arrow' as const, x1: a, x2: b, y, top, label: clip(text, span + LANE_W - 24), labelX: Math.min(a, b) + span / 2, labelY: top + 18, anchor: 'middle' as const };
    }),
  };
}
