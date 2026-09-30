import { describe, expect, it } from 'vitest';
import { formatUpdated } from './time';

const now = new Date('2026-09-30T12:00:00Z');
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();

describe('formatUpdated', () => {
  it('reads like a person would say it', () => {
    expect(formatUpdated(ago(0.2), now)).toBe('just now');
    expect(formatUpdated(ago(2), now)).toBe('2 min ago');
    expect(formatUpdated(ago(180), now)).toBe('3 hr ago');
    expect(formatUpdated(ago(24 * 60), now)).toBe('yesterday');
    expect(formatUpdated(ago(4 * 24 * 60), now)).toBe('4 days ago');
    expect(formatUpdated(ago(21 * 24 * 60), now)).not.toMatch(/ago/);
  });
});
