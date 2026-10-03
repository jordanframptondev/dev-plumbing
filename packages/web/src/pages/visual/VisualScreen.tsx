import type { TypeEntry, TypeItemRow } from '@dev-plumbing/core/schemas';
import { DiagramScreen } from './DiagramScreen';
import { OtherItems } from './OtherItems';

/** What every visual screen gets: the plumbing type, its rows, and `?item=`, the item to open. */
export type ScreenProps = { repo: string; project: string; data: { type: TypeEntry; items: TypeItemRow[] }; item?: string };

/** Architecture, Database, UI changes and Flows. Each screen draws what it can; nothing an item holds is ever hidden. */
export function VisualScreen(p: ScreenProps) {
  const { type, items } = p.data;
  return (
    <div data-testid="visual-screen" data-screen={type.screen}>
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[20px] font-semibold">{type.title}</h2>
        <span className="text-[12px] text-ink-3">
          {items.length} item{items.length === 1 ? '' : 's'}
        </span>
      </header>
      {items.length ? <ScreenBody {...p} /> : <p className="mt-6 text-[13px] text-ink-3">Nothing here yet.</p>}
    </div>
  );
}

function ScreenBody(p: ScreenProps) {
  switch (p.data.type.screen) {
    // Each screen adds its case here as it lands.
    case 'diagram':
      return <DiagramScreen {...p} />;
    default:
      // Screens that aren't drawn yet list their items as rows.
      return <OtherItems rows={p.data.items} repo={p.repo} project={p.project} />;
  }
}
