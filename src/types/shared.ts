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
