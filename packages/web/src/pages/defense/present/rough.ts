import rough from 'roughjs';
import type { Drawable } from 'roughjs/bin/core';
import type { RoughGenerator } from 'roughjs/bin/generator';
import type { BoardShape } from './boardLayout';

/** One stroke of a hand-drawn shape, for an SVG path. */
export type RoughPath = { d: string; stroke: string; strokeWidth: number };
type Box = { x: number; y: number; w: number; h: number };

/** A marker's wobble: enough to look drawn by hand, not so much that a line misses its box. */
const LOOK = { roughness: 1, bowing: 0.8 };
const WIDTH: Record<BoardShape['kind'], number> = { box: 1.5, line: 1.3, group: 1 };
/** An arrowhead's two strokes: how long, and how far each leans from the line. */
const HEAD = 9;
const SPREAD = Math.PI / 7;

/** A stable seed for a ref (FNV-1a), from 1 to 2^31 - 1, so a part looks the same every time it's drawn. */
export function seedOf(ref: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < ref.length; i++) {
    h ^= ref.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 0x7fffffff) + 1;
}

/** A generator seeded for one ref: Rough.js draws from its own random numbers, so the same seed gives the same lines. */
const generatorFor = (ref: string, stroke: string, strokeWidth: number) => rough.generator({ options: { ...LOOK, seed: seedOf(ref), stroke, strokeWidth } });

const pathsOf = (gen: RoughGenerator, drawable: Drawable): RoughPath[] =>
  gen.toPaths(drawable).map((p) => ({ d: p.d, stroke: p.stroke, strokeWidth: p.strokeWidth }));

/** The two short strokes of an arrowhead at a line's end, along its last segment that has a length. */
function arrowhead(points: { x: number; y: number }[]): [number, number, number, number][] {
  const end = points[points.length - 1]!;
  let from = points[points.length - 2]!;
  for (let i = points.length - 2; i >= 0 && from.x === end.x && from.y === end.y; i--) from = points[i]!;
  const angle = Math.atan2(end.y - from.y, end.x - from.x);
  return [angle - SPREAD, angle + SPREAD].map((a) => [end.x, end.y, end.x - HEAD * Math.cos(a), end.y - HEAD * Math.sin(a)]);
}

/**
 * A board shape drawn by hand, as SVG paths in `stroke`: a box is a rectangle, a group a rectangle (the board dashes
 * it), a line a path through its points with a small arrowhead of two strokes. A line with no points (a flow's note)
 * has no strokes, only its label. Seeded from the ref, so it's the same every time and in tests.
 */
export function roughShape(shape: BoardShape, stroke: string): RoughPath[] {
  const gen = generatorFor(shape.ref, stroke, WIDTH[shape.kind]);
  if (shape.kind !== 'line') return pathsOf(gen, gen.rectangle(shape.x, shape.y, shape.w, shape.h));
  if (shape.points.length < 2) return [];
  const line = pathsOf(gen, gen.linearPath(shape.points.map((p) => [p.x, p.y])));
  if (!shape.arrow) return line;
  return [...line, ...arrowhead(shape.points).flatMap(([x1, y1, x2, y2]) => pathsOf(gen, gen.line(x1, y1, x2, y2)))];
}

/** A note's marker: a loose ellipse drawn around a part, in the note's ink, seeded from the note's own key. */
export function roughMarker(around: Box, key: string, stroke: string): RoughPath[] {
  const gen = generatorFor(key, stroke, 1.6);
  return pathsOf(gen, gen.ellipse(around.x + around.w / 2, around.y + around.h / 2, around.w + 28, around.h + 22));
}
