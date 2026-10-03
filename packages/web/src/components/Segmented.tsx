export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex rounded-[8px] bg-selection p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-[6px] px-3 py-1 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-40 ${o.value === value ? 'bg-cell text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]' : 'text-ink-2'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
