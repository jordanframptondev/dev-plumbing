export function Switch({ id, checked, onChange, label }: { id?: string; checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors ${checked ? 'bg-slate' : 'bg-mist'}`}
    >
      <span className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-[left] ${checked ? 'left-[18px]' : 'left-[2px]'}`} />
    </button>
  );
}
