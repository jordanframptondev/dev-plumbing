import { describe, expect, it } from 'vitest';
import { defaultAgents, parseAgents } from './agents';

describe('agents', () => {
  it('has the defaults from the spec', () => {
    expect(defaultAgents).toEqual({
      maxParallel: 4,
      groupLinkedThreads: true,
      models: { repoSetup: 'sonnet', importer: 'sonnet', thread: 'sonnet', finalizer: 'opus', whiteboard: 'opus' },
      waitHeartbeatSeconds: 60,
    });
  });

  it('reads nested model settings and keeps the other defaults', () => {
    const r = parseAgents({ models: { thread: 'haiku' } });
    expect(r.value.models.thread).toBe('haiku');
    expect(r.value.models.finalizer).toBe('opus');
    expect(r.errors).toEqual([]);
  });

  it('rejects an unknown model', () => {
    const r = parseAgents({ models: { thread: 'gpt' } });
    expect(r.value.models.thread).toBe('sonnet');
    expect(r.errors[0].key).toBe('models.thread');
  });
});
