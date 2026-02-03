import type { ContextAdapter, ContextSource } from '../../types/context-search';
import { SlackAdapter } from './slack-adapter';
import { NotionAdapter } from './notion-adapter';
import { GmailAdapter } from './gmail-adapter';

const adapters: Map<ContextSource, ContextAdapter> = new Map();

export function getAdapter(source: ContextSource): ContextAdapter {
  let adapter = adapters.get(source);
  
  if (!adapter) {
    switch (source) {
      case 'slack':
        adapter = new SlackAdapter();
        break;
      case 'notion':
        adapter = new NotionAdapter();
        break;
      case 'gmail':
        adapter = new GmailAdapter();
        break;
      default:
        throw new Error(`Unsupported context source: ${source}`);
    }
    adapters.set(source, adapter);
  }
  
  return adapter;
}

export function getAvailableAdapters(): ContextSource[] {
  return ['slack', 'notion', 'gmail'];
}

export { SlackAdapter, NotionAdapter, GmailAdapter };
