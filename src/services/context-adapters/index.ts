import type { ContextAdapter, ContextSource } from '../../types/context-search';
import { SlackAdapter } from './slack-adapter';

const adapters: Map<ContextSource, ContextAdapter> = new Map();

export function getAdapter(source: ContextSource): ContextAdapter {
  let adapter = adapters.get(source);
  
  if (!adapter) {
    switch (source) {
      case 'slack':
        adapter = new SlackAdapter();
        break;
      case 'notion':
      case 'gmail':
      case 'linear':
        throw new Error(`${source} adapter not implemented yet`);
    }
    adapters.set(source, adapter);
  }
  
  return adapter;
}

export function getAvailableAdapters(): ContextSource[] {
  return ['slack'];
}

export { SlackAdapter };
