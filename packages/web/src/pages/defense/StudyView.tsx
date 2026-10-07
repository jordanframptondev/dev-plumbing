import { DEFENSE_PARTS, DEFENSE_SECTIONS, type WhiteboardDefense } from '@dev-plumbing/core/schemas';
import type { MouseEvent } from 'react';
import type { DefenseViewProps } from './DefensePage';

type Entry = { anchor: string; n: number; title: string };

const numberOf = (id: WhiteboardDefense['sections'][number]['id']) => DEFENSE_SECTIONS.find((s) => s.id === id)?.n ?? 0;

/** The 13 parts in order: prose sections 1–9, the questions (10), the concerns (11), the unknowns (12), the checklist (13). */
export function contents(d: WhiteboardDefense): Entry[] {
  const prose = d.sections.map((s) => ({ anchor: `defense-section-${s.id}`, n: numberOf(s.id), title: s.title }));
  const parts = [
    { anchor: 'defense-questions', ...DEFENSE_PARTS.questions },
    { anchor: 'defense-concerns', ...DEFENSE_PARTS.concerns },
    { anchor: 'defense-checklist', ...DEFENSE_PARTS.checklist },
  ];
  return [...prose, ...parts].sort((a, b) => a.n - b.n);
}

/** Scrolls to a part in place, so the page's address (and its ?mode) stays as it is. */
function jump(anchor: string) {
  return (e: MouseEvent) => {
    const target = document.getElementById(anchor);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}

export function Contents({ defense }: { defense: WhiteboardDefense }) {
  return (
    <nav aria-label="Contents" className="mt-6">
      <p className="text-[12px] font-semibold text-ink-3">Contents</p>
      <ol className="mt-1.5 text-[13px] leading-6 md:columns-2">
        {contents(defense).map((e) => (
          <li key={e.anchor} className="break-inside-avoid">
            <a href={`#${e.anchor}`} onClick={jump(e.anchor)} className="text-slate">
              {e.n}. {e.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Study: the defense to read. Its contents for now; the sections come next. */
export function StudyView({ view }: DefenseViewProps) {
  return <Contents defense={view.defense} />;
}
