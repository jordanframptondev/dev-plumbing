import type { DiagramData, NodeStatus, TypeItemRow } from '@dev-plumbing/core/schemas';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { StatusMark } from '../../components/StatusMark';
import { DiagramView } from '../../diagram/DiagramView';
import { AnchorForm } from './AnchorForm';
import { DataProblem } from './DataProblem';
import { OtherItems } from './OtherItems';
import { anchorsOn, bubblesFrom, itemAnchorId, splitRows, useScrollToItem } from './rows';
import type { ScreenProps } from './VisualScreen';

const STATUS_WORD: Record<NodeStatus, { text: string; className: string }> = {
  new: { text: 'New', className: 'text-moss' },
  changed: { text: 'Changed', className: 'text-amber' },
  unchanged: { text: 'Unchanged', className: 'text-ink-3' },
  external: { text: 'External', className: 'text-ink-3' },
};
const KIND_TAG = { system: 'System', data_flow: 'Data flow' } as const;

type Selection = { itemId: string; nodeId: string } | null;

/** Architecture: each item's diagram, with thread bubbles on its boxes and a panel for the box you pick. */
export function DiagramScreen({ repo, project, data, item }: ScreenProps) {
  const { shown, anchored, other } = splitRows('diagram', data.items);
  const [selected, setSelected] = useState<Selection>(null);
  useScrollToItem(item);

  // Threads about a box that's still drawn become bubbles. Threads about a box Claude has since removed are listed
  // under that diagram, marked "Not in this version". Any other anchored thread is listed with the other items.
  const placed = new Set<string>();
  const pinsFor = new Map<string, Map<string, TypeItemRow[]>>();
  const goneFor = new Map<string, TypeItemRow[]>();
  for (const s of shown) {
    if (!s.ok) continue;
    const ids = new Set(s.data.nodes.map((n) => n.id));
    const all = [...anchorsOn(anchored, s.row.id, 'node')];
    for (const [, rows] of all) for (const r of rows) placed.add(r.id);
    pinsFor.set(s.row.id, new Map(all.filter(([nodeId]) => ids.has(nodeId))));
    goneFor.set(s.row.id, all.filter(([nodeId]) => !ids.has(nodeId)).flatMap(([, rows]) => rows));
  }
  const leftovers = [...other, ...anchored.filter((r) => !placed.has(r.id))];

  return (
    <div className="mt-4 space-y-8">
      {shown.map((s) =>
        s.ok ? (
          <DiagramSection
            key={s.row.id}
            row={s.row}
            diagram={s.data}
            pins={pinsFor.get(s.row.id) ?? new Map()}
            gone={goneFor.get(s.row.id) ?? []}
            rows={data.items}
            type={data.type.id}
            highlighted={item === s.row.id}
            selectedNode={selected?.itemId === s.row.id ? selected.nodeId : null}
            onSelect={(nodeId) => setSelected(nodeId ? { itemId: s.row.id, nodeId } : null)}
            repo={repo}
            project={project}
          />
        ) : (
          <div key={s.row.id} id={itemAnchorId(s.row.id)}>
            <DataProblem title={s.row.title} problems={s.problems} data={s.row.data} threadId={s.row.threadId} repo={repo} project={project} />
          </div>
        ),
      )}
      <OtherItems rows={leftovers} repo={repo} project={project} title={shown.length ? 'Other items' : undefined} />
    </div>
  );
}

function DiagramSection({
  row,
  diagram,
  pins,
  gone,
  rows,
  type,
  highlighted,
  selectedNode,
  onSelect,
  repo,
  project,
}: {
  row: TypeItemRow;
  diagram: DiagramData;
  pins: Map<string, TypeItemRow[]>;
  gone: TypeItemRow[];
  rows: TypeItemRow[];
  type: string;
  highlighted: boolean;
  selectedNode: string | null;
  onSelect: (nodeId: string | null) => void;
  repo: string;
  project: string;
}) {
  const node = selectedNode ? (diagram.nodes.find((n) => n.id === selectedNode) ?? null) : null;
  // ✓ and "not found" only when the boxes were checked; without the clone, the section says "Not checked" instead.
  const checks = row.checks?.kind === 'diagram' && row.checks.checked ? row.checks.nodes : undefined;
  const notChecked = row.checks?.kind === 'diagram' && !row.checks.checked ? row.checks.reason : null;
  return (
    <section
      id={itemAnchorId(row.id)}
      data-testid="diagram-section"
      data-item={row.id}
      data-selected={highlighted ? 'true' : undefined}
      aria-label={row.title}
      className={`scroll-mt-4 ${highlighted ? 'rounded-[12px] outline outline-1 outline-offset-4 outline-slate' : ''}`}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-[15px] font-semibold">{row.title}</h3>
        <span className="text-[11.5px] text-ink-3">{KIND_TAG[diagram.kind]}</span>
        <span className="ml-auto flex items-center gap-1.5 text-[12px]">
          <StatusMark status={row.status} />
          <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: row.threadId }} className="text-slate">
            Open thread
          </Link>
        </span>
      </header>
      <p className="mt-0.5 text-[12.5px] text-ink-2">{row.summary}</p>
      {notChecked && (
        <p data-testid="diagram-checks" className="mt-0.5 text-[12px] text-ink-3">
          Not checked · {notChecked}
        </p>
      )}
      <div className={`mt-3 grid grid-cols-1 gap-4 ${node ? 'min-[1100px]:grid-cols-[minmax(0,1fr)_300px]' : ''}`}>
        <div className="min-w-0">
          <DiagramView
            data={diagram}
            checks={checks}
            bubbles={bubblesFrom(pins)}
            selected={selectedNode}
            onSelect={(id) => onSelect(id === selectedNode ? null : id)}
            legend
          />
        </div>
        {node && (
          <NodePanel
            key={node.id}
            node={node}
            check={checks?.[node.id]}
            threads={pins.get(node.id) ?? []}
            rows={rows}
            itemId={row.id}
            type={type}
            onClose={() => onSelect(null)}
            repo={repo}
            project={project}
          />
        )}
      </div>
      {gone.length > 0 && (
        <ul aria-label="Threads about boxes not in this version" className="mt-3 flex flex-col gap-1 text-[12.5px]">
          {gone.map((t) => (
            <li key={t.id} data-testid="gone-pin" className="flex items-center gap-2">
              <StatusMark status={t.status} />
              <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: t.threadId }} className="min-w-0 truncate text-slate">
                {t.title}
              </Link>
              <span className="shrink-0 text-[11.5px] text-ink-3">Not in this version</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NodePanel({
  node,
  check,
  threads,
  rows,
  itemId,
  type,
  onClose,
  repo,
  project,
}: {
  node: DiagramData['nodes'][number];
  check: boolean | undefined;
  threads: TypeItemRow[];
  rows: TypeItemRow[];
  itemId: string;
  type: string;
  onClose: () => void;
  repo: string;
  project: string;
}) {
  const [asking, setAsking] = useState(false);
  const linked = node.itemId ? rows.find((r) => r.id === node.itemId) : undefined;
  const word = STATUS_WORD[node.status];
  return (
    <aside data-testid="node-panel" aria-label={`Box: ${node.label}`} className="min-w-0 self-start rounded-[10px] border-[0.5px] border-separator bg-cell px-3 py-3 text-[12.5px]">
      <div className="flex items-start gap-2">
        <h4 className="min-w-0 flex-1 text-[14px] font-semibold">{node.label}</h4>
        <button type="button" onClick={onClose} className="shrink-0 text-[12px] text-slate">
          Close
        </button>
      </div>
      <p className={`mt-0.5 text-[12px] font-medium ${word.className}`}>{word.text}</p>
      {node.codeRef && (
        <p className="mt-2 break-all font-mono text-[11.5px] text-ink-2">
          {node.codeRef.path}
          {node.codeRef.symbol ? ` · ${node.codeRef.symbol}` : ''}{' '}
          {check === true && <span className="text-moss">✓</span>}
          {check === false && <span className="font-sans text-amber">not found</span>}
        </p>
      )}
      {node.itemId && (
        <p className="mt-2 text-ink-2">
          Linked:{' '}
          {linked ? (
            <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: linked.threadId }} className="text-slate">
              {linked.title}
            </Link>
          ) : (
            <span className="font-mono text-[11.5px] text-ink-3">{node.itemId}</span>
          )}
        </p>
      )}
      {threads.length > 0 && (
        <ul className="mt-3 space-y-1" aria-label="Threads about this box">
          {threads.map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              <StatusMark status={t.status} />
              <Link to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: t.threadId }} className="min-w-0 truncate text-slate">
                {t.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {asking ? (
        <AnchorForm repo={repo} project={project} type={type} anchor={{ itemId, kind: 'node', ref: node.id, label: node.label }} onDone={() => setAsking(false)} />
      ) : (
        <Button className="mt-3" onClick={() => setAsking(true)}>
          Ask about this box
        </Button>
      )}
    </aside>
  );
}
