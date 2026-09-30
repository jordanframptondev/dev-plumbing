import type { ReactNode } from 'react';

export function Group({ title, children, testId }: { title?: string; children: ReactNode; testId?: string }) {
  return (
    <section className="mt-4" data-testid={testId}>
      {title && <h3 className="mb-1.5 ml-0.5 text-[12px] font-semibold text-ink-3">{title}</h3>}
      <div className="overflow-hidden rounded-[10px] border-[0.5px] border-separator bg-cell [&>*+*]:border-t-[0.5px] [&>*+*]:border-separator">{children}</div>
    </section>
  );
}

export function Row({ leading, title, meta, trailing }: { leading?: ReactNode; title: ReactNode; meta?: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      {leading}
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">{title}</div>
        {meta && <div className="truncate text-[11.5px] text-ink-3">{meta}</div>}
      </div>
      {trailing}
    </div>
  );
}
