/** AI analysis result (consolidated from gemini-analyzer.ts and anthropic-analyzer.ts) */
export interface AnalysisResult {
  title: string;
  description: string;
  success: boolean;
  suggestedProjectId?: string;
  suggestedAssigneeId?: string;
  suggestedPriority?: number;
  suggestedEstimate?: number;
  error?: string;
}

/** AI analysis context for project/user matching */
export interface AnalysisContext {
  projects: Array<{ id: string; name: string; description?: string; recentIssueTitles?: string[] }>;
  users: Array<{ id: string; name: string }>;
  defaultTeamId?: string;
  instruction?: string;
  language: string;
}

/** Sync result from any sync adapter */
export interface SyncResult {
  success: boolean;
  itemsSynced: number;
  itemsFailed: number;
  errors: Array<{ id: string; error: string }>;
  lastCursor?: string;
}

/** Sync progress reported by adapters */
export interface SyncProgress {
  source: 'notion' | 'slack' | 'linear' | 'gmail';
  phase: 'discovering' | 'syncing' | 'embedding' | 'complete';
  current: number;
  total: number;
}

export type SyncProgressCallback = (progress: SyncProgress) => void;

/** Single file upload result */
export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

/** Multiple file upload result */
export interface MultiUploadResult {
  success: boolean;
  urls?: string[];
  error?: string;
}
