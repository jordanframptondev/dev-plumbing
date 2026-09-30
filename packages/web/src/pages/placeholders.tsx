const Soon = ({ title }: { title: string }) => (
  <div className="mx-auto max-w-3xl px-4 py-6">
    <h1 className="text-[26px] font-bold tracking-tight">{title}</h1>
  </div>
);

export const SettingsPage = () => <Soon title="Settings" />;
export const RulesPage = () => <Soon title="Plumbing rules" />;
export const RuleEditorPage = () => <Soon title="Rules file" />;
export const OutputEditorPage = () => <Soon title="Output rules" />;
