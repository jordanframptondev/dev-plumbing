import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary';
type Size = 'sm' | 'md' | 'lg';
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size };

const SIZES = { sm: 'rounded-[6px] px-2.5 py-1 text-[11.5px]', md: 'rounded-[7px] px-3 py-1.5 text-[12.5px]', lg: 'rounded-[11px] px-4 py-2.5 text-[14px]' };

/** A Button's classes, for a link that should look like one. */
export function buttonClass({ variant = 'secondary', size = 'md', className = '' }: { variant?: Variant; size?: Size; className?: string } = {}): string {
  const look = variant === 'primary' ? 'bg-button text-button-text' : 'border-[0.5px] border-separator bg-cell text-ink';
  return `inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate disabled:cursor-not-allowed disabled:opacity-40 ${look} ${SIZES[size]} ${className}`;
}

export function Button({ variant = 'secondary', size = 'md', className = '', type = 'button', ...rest }: Props) {
  return <button type={type} className={buttonClass({ variant, size, className })} {...rest} />;
}
