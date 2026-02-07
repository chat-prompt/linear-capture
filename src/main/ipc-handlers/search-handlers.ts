import { ipcMain } from 'electron';
import { logger } from '../../services/utils/logger';
import { createLinearServiceFromEnv } from '../../services/linear-client';
import { createGmailService } from '../../services/gmail-client';
import { getLocalSearchService } from '../../services/local-search';
import { getAdapter } from '../../services/context-adapters';
import { getState } from '../state';
import type { ContextSource } from '../../types/context-search';

export function registerSearchHandlers(): void {
  const state = getState();

  ipcMain.handle('context-semantic-search', async (_event, { query, source }: { query: string; source: string }) => {
    logger.log(`[SemanticSearch] Handler called: query="${query}", source="${source}"`);

    try {
      const adapter = getAdapter(source as ContextSource);
      const isConnected = await adapter.isConnected();

      if (!isConnected) {
        return { success: true, results: [], notConnected: true };
      }

      const localSearch = getLocalSearchService();
      if (!localSearch?.isInitialized()) {
        return { success: true, results: [] };
      }

      const results = await localSearch.search(query, [], 20, source);
      logger.log(`[SemanticSearch] Search returned ${results.length} results`);

      return { success: true, results };
    } catch (error) {
      logger.error('[SemanticSearch] Error:', error);
      return { success: false, error: String(error), results: [] };
    }
  });

  ipcMain.handle('context.getRelated', async (_event, { query, limit = 20 }: { query: string; limit?: number }) => {
    if (!query || query.length < 3) {
      return { success: true, results: [] };
    }

    try {
      const QUOTA_PER_SOURCE = 5;
      const results: any[] = [];

      const localSearch = getLocalSearchService();
      const useLocalSearch = localSearch?.isInitialized() ?? false;

      if (useLocalSearch) {
        const localResults = await localSearch!.search(query, [], QUOTA_PER_SOURCE * 4);

        for (const source of ['slack', 'notion', 'linear', 'gmail'] as const) {
          results.push(...localResults
            .filter(r => r.source === source)
            .slice(0, QUOTA_PER_SOURCE)
            .map(r => ({
              id: `${source}-${r.id}`,
              source,
              title: r.title || '',
              snippet: r.content?.substring(0, 200) || '',
              url: r.url,
              timestamp: r.timestamp,
            }))
          );
        }

      } else {
        const gmailService = createGmailService();
        const linearService = createLinearServiceFromEnv();

        const [slackConnected, notionConnected, gmailConnected, linearConnected] = await Promise.all([
          state.slackService?.getConnectionStatus().then(s => s.connected).catch(() => false) ?? false,
          state.notionService?.getConnectionStatus().then(s => s.connected).catch(() => false) ?? false,
          gmailService?.getConnectionStatus().then(s => s.connected).catch(() => false) ?? false,
          Promise.resolve(linearService !== null),
        ]);

        const [slackResult, notionResult, gmailResult, linearResult] = await Promise.allSettled([
          (async () => {
            if (!slackConnected) return [];
            const result = await state.slackService!.searchMessages(query, undefined, QUOTA_PER_SOURCE);
            return (result.messages || []).map(m => ({
              id: `slack-${m.ts}`,
              source: 'slack' as const,
              title: `#${m.channel?.name || 'unknown'}`,
              snippet: m.text?.substring(0, 200) || '',
              url: m.permalink,
              timestamp: m.timestamp,
            }));
          })(),

          (async () => {
            if (!notionConnected) return [];
            const adapter = getAdapter('notion');
            const items = await adapter.fetchItems(query, QUOTA_PER_SOURCE);
            return items.map(item => ({
              id: `notion-${item.id}`,
              source: 'notion' as const,
              title: item.title,
              snippet: item.content?.substring(0, 200) || '',
              url: item.url,
              timestamp: item.timestamp,
            }));
          })(),

          (async () => {
            if (!gmailConnected) return [];
            const adapter = getAdapter('gmail');
            const items = await adapter.fetchItems(query, QUOTA_PER_SOURCE);
            return items.map(item => ({
              id: `gmail-${item.id}`,
              source: 'gmail' as const,
              title: item.title,
              snippet: item.content?.substring(0, 200) || '',
              url: item.url,
              timestamp: item.timestamp,
            }));
          })(),

          (async () => {
            if (!linearConnected) return [];
            const adapter = getAdapter('linear');
            const items = await adapter.fetchItems(query, QUOTA_PER_SOURCE);
            return items.map(item => ({
              id: `linear-${item.id}`,
              source: 'linear' as const,
              title: item.title,
              snippet: item.content?.substring(0, 200) || '',
              url: item.url,
              timestamp: item.timestamp,
            }));
          })(),
        ]);

        [slackResult, notionResult, gmailResult, linearResult].forEach((r) => {
          if (r.status === 'fulfilled') {
            results.push(...r.value);
          }
        });
      }

      const seen = new Set<string>();
      const deduplicated = results.filter(r => {
        if (!r.url) return true;
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
      });

      const sorted = deduplicated.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

      return {
        success: true,
        results: sorted.slice(0, limit),
      };
    } catch (error) {
      return { success: false, error: String(error), results: [] };
    }
  });
}
