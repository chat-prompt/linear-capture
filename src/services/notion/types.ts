/**
 * Notion Local Reader Types
 */

export interface LocalNotionPage {
  id: string;
  title: string;
  url: string;
  lastEditedTime: string;
  spaceId: string;
  parentId?: string;
  /** Search match context (snippet of matched content) */
  matchContext?: string;
  /** Whether this result is from content search (vs title only) */
  isContentMatch?: boolean;
}

export interface LocalSearchResult {
  success: boolean;
  pages: LocalNotionPage[];
  /** Search source indicator */
  source: 'local' | 'api';
  /** Total count before limit */
  total?: number;
  error?: string;
}

export interface NotionLocalStatus {
  available: boolean;
  initialized: boolean;
  error?: string;
}
