import { BASIS_LABELS, type Basis, type Severity } from '@dev-plumbing/core/schemas';

// §16: colour is only ever the text. Known is quiet, Inferred plain ink (slate is the links' colour, and these sit next
// to links), Unknown amber, and Verify before release seal.
const BASIS_CLASSES: Record<Basis, string> = { known: 'text-ink-3', inferred: 'text-ink-2', unknown: 'text-amber', verify: 'text-seal' };
// The risk labels: critical and high seal, medium amber, low ochre, informational quiet.
const SEVERITY_CLASSES: Record<Severity, string> = { critical: 'text-seal', high: 'text-seal', medium: 'text-amber', low: 'text-ochre', info: 'text-ink-3' };

export const basisClass = (b: Basis): string => BASIS_CLASSES[b];
export const severityClass = (s: Severity): string => SEVERITY_CLASSES[s];

/** How sure a statement is: Known, Inferred, Unknown or Verify before release, as a small coloured caption. */
export function BasisLabel({ basis }: { basis: Basis }) {
  return <span className={`whitespace-nowrap text-[11px] font-medium ${basisClass(basis)}`}>{BASIS_LABELS[basis]}</span>;
}
