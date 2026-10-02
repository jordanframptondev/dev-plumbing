import { describe, expect, it } from 'vitest';
import { firstParagraph, headingsOf, sectionFor, titleFromMarkdown } from './markdown';

const md = [
  '# Restock reminders',
  '',
  'Remind customers before an item',
  'runs out.',
  '',
  '## Approach',
  '',
  'A daily job.',
  '',
  '```',
  '## not a heading',
  '```',
  '',
  '### Details',
  '',
  'More.',
  '',
  '## Data',
  '',
  'A table.',
  '',
].join('\n');

describe('markdown helpers', () => {
  it('lists headings outside code fences', () => {
    expect(headingsOf(md).map((h) => [h.level, h.text])).toEqual([
      [1, 'Restock reminders'],
      [2, 'Approach'],
      [3, 'Details'],
      [2, 'Data'],
    ]);
  });

  it('cuts a section up to the next heading at the same or a higher level', () => {
    expect(sectionFor(md, 'approach')).toBe('## Approach\n\nA daily job.\n\n```\n## not a heading\n```\n\n### Details\n\nMore.');
    expect(sectionFor(md, '  Data ')).toBe('## Data\n\nA table.');
    expect(sectionFor(md, 'Nope')).toBeNull();
  });

  it('finds the title and the first paragraph', () => {
    expect(titleFromMarkdown(md)).toBe('Restock reminders');
    expect(titleFromMarkdown('no heading here')).toBeNull();
    expect(firstParagraph(md)).toBe('Remind customers before an item runs out.');
    expect(firstParagraph(`# T\n\n${'word '.repeat(200)}`, 20)).toHaveLength(20);
  });
});
