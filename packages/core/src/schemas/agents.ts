import { defaultsOf, parseFields, type FieldError, type FieldSpec } from './fields';

export const modelOptions = ['haiku', 'sonnet', 'opus', 'fable'] as const;
export type Model = (typeof modelOptions)[number];

export type AgentsConfig = {
  maxParallel: number;
  groupLinkedThreads: boolean;
  models: { repoSetup: Model; importer: Model; thread: Model; finalizer: Model; whiteboard: Model };
  waitHeartbeatSeconds: number;
};

export const agentsFields = [
  { key: 'maxParallel', label: 'Subagents at once', kind: 'number', default: 4, min: 1, max: 16, description: 'The most subagents running at the same time.' },
  { key: 'groupLinkedThreads', label: 'Group linked threads', kind: 'boolean', default: true, description: "Send threads that share linked items to one subagent, so they can't contradict each other." },
  { key: 'models.repoSetup', label: 'Repo setup model', kind: 'enum', default: 'sonnet', options: modelOptions, description: 'Model for detecting a repo profile.' },
  { key: 'models.importer', label: 'Importer model', kind: 'enum', default: 'sonnet', options: modelOptions, description: 'Model for importing each plumbing type.' },
  { key: 'models.thread', label: 'Thread model', kind: 'enum', default: 'sonnet', options: modelOptions, description: 'Model for thread replies.' },
  { key: 'models.finalizer', label: 'Finalizer model', kind: 'enum', default: 'opus', options: modelOptions, description: 'Model for Finalize spec.' },
  { key: 'models.whiteboard', label: 'Whiteboard Defense model', kind: 'enum', default: 'opus', options: modelOptions, description: 'Model for Whiteboard Defense.' },
  { key: 'waitHeartbeatSeconds', label: 'Heartbeat (seconds)', kind: 'number', default: 60, min: 10, max: 600, description: 'How often the listening main window reports that it is still waiting.' },
] as const satisfies readonly FieldSpec[];

export const defaultAgents = defaultsOf(agentsFields) as AgentsConfig;

export function parseAgents(input: unknown): { value: AgentsConfig; errors: FieldError[] } {
  const r = parseFields(agentsFields, input);
  return { value: r.value as AgentsConfig, errors: r.errors };
}
