export type ContextSource = 'slack' | 'notion' | 'gmail';

export interface ContextItem {
  id: string;
  content: string;
  title?: string;
  url?: string;
  source: ContextSource;
  timestamp?: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface SearchResult extends ContextItem {
  score: number;
}

export interface SemanticSearchRequest {
  query: string;
  items: ContextItem[];
  limit?: number;
}

export interface SemanticSearchResponse {
  success: boolean;
  results?: SearchResult[];
  error?: string;
}

export interface ContextAdapter {
  readonly source: ContextSource;
  isConnected(): Promise<boolean>;
  fetchItems(query?: string, limit?: number): Promise<ContextItem[]>;
}

export type AnalyticsEvent = 'app_open' | 'issue_created' | 'search_used' | 'context_linked';

export interface TrackRequest {
  event: AnalyticsEvent;
  deviceId: string;
  metadata?: {
    imageCount?: number;
    hasContext?: boolean;
    contextSource?: string;
    version?: string;
  };
}

export interface TrackResponse {
  success: boolean;
  error?: string;
}
