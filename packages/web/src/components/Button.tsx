import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary'; size?: 'sm' | 'md' | 'lg' };

const SIZES = { sm: 'rounded-[6px] px-2.5 py-1 text-[11.5px]', md: 'rounded-[7px] px-3 py-1.5 text-[12.5px]', lg: 'rounded-[11px] px-4 py-2.5 text-[14px]' };

export function Button({ variant = 'secondary', size = 'md', className = '', type = 'button', ...rest }: Props) {
  const look = variant === 'primary' ? 'bg-button text-button-text' : 'border-[0.5px] border-separator bg-cell text-ink';
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center whitespace-nowrap font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate disabled:cursor-not-allowed disabled:opacity-40 ${look} ${SIZES[size]} ${className}`}
      {...rest}
    />
  );
}
