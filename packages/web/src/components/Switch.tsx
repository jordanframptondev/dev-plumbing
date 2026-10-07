/**
 * An on/off switch. While `busy` (something it depends on is saving) it's marked aria-disabled and ignores presses,
 * rather than being disabled, so it keeps the focus.
 */
export function Switch({ id, checked, onChange, label, busy }: { id?: string; checked: boolean; onChange: (value: boolean) => void; label: string; busy?: boolean }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={busy || undefined}
      onClick={() => {
        if (!busy) onChange(!checked);
      }}
      className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors aria-disabled:cursor-not-allowed aria-disabled:opacity-40 ${checked ? 'bg-slate' : 'bg-mist'}`}
    >
      <span className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-[left] ${checked ? 'left-[18px]' : 'left-[2px]'}`} />
    </button>
  );
}
