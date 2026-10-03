// Helpers for the visual screens' component tests. Only test files import this.
import type { TypeItemRow } from '@dev-plumbing/core/schemas';
import type { ReactNode } from 'react';

/** A screen row with every field set, overridden as needed. */
export function row(over: Partial<TypeItemRow> = {}): TypeItemRow {
  return {
    id: 'architecture-system',
    threadId: 't-architecture-system',
    title: 'System view',
    summary: 'Jobs, notifications and tables.',
    status: 'idle',
    blocking: false,
    fields: {},
    messageCount: 0,
    latest: null,
    open: null,
    draft: null,
    decision: null,
    flagged: false,
    data: null,
    body: null,
    links: [],
    anchor: null,
    createdBy: 'import',
    checks: null,
    itemRefs: {},
    ...over,
  };
}

type LinkProps = { to: string; params?: Record<string, string>; search?: Record<string, string>; children?: ReactNode; [attr: string]: unknown };

/**
 * The component tests run without a router. Use as
 * `vi.mock('@tanstack/react-router', async () => (await import('./testkit')).routerMock(navigate))`:
 * links become plain anchors with their params filled in (and their string attributes kept), and `navigate` is your spy.
 */
export function routerMock(navigate: (to: unknown) => unknown) {
  return {
    useNavigate: () => navigate,
    Link: ({ to, params, search, children, ...rest }: LinkProps) => {
      const path = Object.entries(params ?? {}).reduce((url, [k, v]) => url.replace(`$${k}`, v), to);
      const query = search ? `?${new URLSearchParams(search)}` : '';
      const attrs = Object.fromEntries(Object.entries(rest).filter(([, v]) => typeof v === 'string'));
      return (
        <a href={`${path}${query}`} {...attrs}>
          {children}
        </a>
      );
    },
  };
}
