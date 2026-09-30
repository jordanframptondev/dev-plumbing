import type { DisplayStatus } from '@dev-plumbing/core/schemas';

const LABELS: Record<DisplayStatus, string> = {
  your_turn: 'Your turn',
  draft: 'Draft',
  with_claude: 'With Claude',
  resolved: 'Resolved',
  parked: 'Parked',
  idle: 'Nothing needed',
};

export function StatusMark({ status, size = 9 }: { status: DisplayStatus; size?: number }) {
  const common = { role: 'img', 'aria-label': LABELS[status], 'data-status': status } as const;
  const box = { width: size, height: size };
  switch (status) {
    case 'your_turn':
      return <span {...common} className="inline-block shrink-0 rounded-full bg-seal" style={box} />;
    case 'draft':
      return <span {...common} className="inline-block shrink-0 rounded-full border-[1.5px] border-slate" style={box} />;
    case 'with_claude':
      return <span {...common} className="inline-block shrink-0 rounded-full border-[1.5px] border-dashed border-slate" style={box} />;
    case 'resolved':
      return (
        <span {...common} className="inline-flex shrink-0 items-center justify-center font-bold leading-none text-moss" style={{ width: size + 3, height: size + 3, fontSize: size + 3 }}>
          ✓
        </span>
      );
    case 'parked':
      return <span {...common} className="inline-block shrink-0 rounded-full bg-mist" style={box} />;
    case 'idle':
      return <span aria-hidden="true" data-status="idle" className="inline-block shrink-0" style={box} />;
  }
}
