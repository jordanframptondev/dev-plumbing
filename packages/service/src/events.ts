import { EventEmitter } from 'node:events';
import type { LiveEvent } from '@dev-plumbing/core';

export class LiveEvents {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  emit(event: LiveEvent): void {
    this.emitter.emit('event', event);
  }

  on(listener: (event: LiveEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }

  /** Tells every open tab that this plumbing project, and so the project list, changed. */
  projectChanged(repo: string, id: string): void {
    this.emit({ type: 'project', repo, id });
    this.emit({ type: 'projects' });
  }
}
