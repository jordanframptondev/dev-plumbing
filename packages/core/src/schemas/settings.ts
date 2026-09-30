import { defaultsOf, parseFields, type FieldError, type FieldSpec } from './fields';

export type Settings = {
  port: number;
  projectsFolder: string;
  startAtLogin: boolean;
  openBrowserOnImport: boolean;
  autoApplySmallEdits: boolean;
  homePageSize: number;
  theme: 'light' | 'dark' | 'system';
};

export const settingsFields = [
  { key: 'port', label: 'Port', kind: 'number', default: 4545, min: 1024, max: 65535, description: 'The port the app and service use, on localhost only. A new port needs a restart.' },
  { key: 'projectsFolder', label: 'Projects folder', kind: 'string', format: 'path', default: '~/dev-plumbing-projects', description: 'Where plumbing projects are stored. Each repo gets a subfolder, unless its repo profile sets its own folder.' },
  { key: 'startAtLogin', label: 'Start at login', kind: 'boolean', default: true, description: 'Start the service when you log in to your Mac.' },
  { key: 'openBrowserOnImport', label: 'Open the browser after import', kind: 'boolean', default: true, description: 'Open the plumbing project in your browser after /dev-plumbing imports a plan.' },
  { key: 'autoApplySmallEdits', label: 'Auto-apply small edits', kind: 'boolean', default: true, description: "Apply Claude's wording, typo and layout fixes immediately, each with Undo." },
  { key: 'homePageSize', label: 'Recent projects per page', kind: 'number', default: 10, min: 1, max: 100, description: 'How many recent plumbing projects the app home shows before Load more.' },
  { key: 'theme', label: 'Appearance', kind: 'enum', default: 'system', options: ['light', 'dark', 'system'], description: 'Light, dark, or follow the system setting.' },
] as const satisfies readonly FieldSpec[];

export const defaultSettings = defaultsOf(settingsFields) as Settings;

export function parseSettings(input: unknown): { value: Settings; errors: FieldError[] } {
  const r = parseFields(settingsFields, input);
  return { value: r.value as Settings, errors: r.errors };
}
