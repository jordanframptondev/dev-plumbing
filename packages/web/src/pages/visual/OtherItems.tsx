import type { TypeItemRow } from '@dev-plumbing/core/schemas';
import { Link } from '@tanstack/react-router';
import { Group, Row } from '../../components/GroupedList';
import { StatusMark } from '../../components/StatusMark';

/** Items a visual screen has nothing to draw for: no data yet, or a thread about a part that's gone. Each opens its thread. */
export function OtherItems({ rows, repo, project, title }: { rows: TypeItemRow[]; repo: string; project: string; title?: string }) {
  if (!rows.length) return null;
  return (
    <Group title={title} testId="other-items">
      {rows.map((r) => (
        <Link key={r.id} to="/p/$repo/$project/th/$thread" params={{ repo, project, thread: r.threadId }} className="block hover:bg-selection" data-testid="other-item">
          <Row
            leading={<StatusMark status={r.status} />}
            title={
              <>
                {r.blocking && <span className="mr-1.5 text-[10.5px] font-semibold text-seal">BLOCKING</span>}
                {r.title}
              </>
            }
            meta={r.summary}
          />
        </Link>
      ))}
    </Group>
  );
}
