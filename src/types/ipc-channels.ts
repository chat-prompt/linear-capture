/**
 * IPC Channel Type Contracts
 *
 * Comprehensive type map for all Electron IPC channels used between
 * main process and renderer process. Ensures type-safe communication.
 *
 * Channel categories:
 * - IpcInvokeChannelMap: ipcMain.handle / ipcRenderer.invoke (request/response)
 * - IpcOnChannelMap: ipcMain.on / ipcRenderer.send (fire-and-forget, renderer -> main)
 * - IpcEventChannelMap: webContents.send / ipcRenderer.on (main -> renderer)
 */

import type { AnalysisResult } from './shared';
import type { CapturedImage } from './capture';
import type { ContextSource } from './context-search';

// ---------------------------------------------------------------------------
// Re-exported types from service files (not moved yet, referenced directly)
// ---------------------------------------------------------------------------

import type { CreateIssueResult, TeamInfo, ProjectInfo, UserInfo as LinearUserInfo, WorkflowStateInfo, CycleInfo, LabelInfo } from '../services/linear-client';
import type { Settings, UserInfo as SettingsUserInfo, SlackChannelInfo } from '../services/settings-store';

// ---------------------------------------------------------------------------
// Common response patterns
// ---------------------------------------------------------------------------

/** Standard success/error response used by many IPC handlers */
export interface IpcSuccessResponse {
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// AI Recommend types (from ai-recommend.ts, not exported there)
// ---------------------------------------------------------------------------

export interface AiRecommendation {
  source: string;
  title: string;
  snippet: string;
  score: number;
  url: string;
}

export interface AiRecommendResult {
  success: boolean;
  recommendations?: AiRecommendation[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Sync status types (from local-search.ts)
// ---------------------------------------------------------------------------

export interface SyncSourceStatus {
  lastSync?: number;
  documentCount?: number;
}

export interface SyncStatus {
  initialized: boolean;
  sources?: {
    slack?: SyncSourceStatus;
    notion?: SyncSourceStatus;
    linear?: SyncSourceStatus;
    gmail?: SyncSourceStatus;
  };
  error?: string;
}

// ---------------------------------------------------------------------------
// Slack types (from slack-client.ts, not all exported)
// ---------------------------------------------------------------------------

export interface SlackChannel {
  id: string;
  name: string;
  is_private: boolean;
  num_members?: number;
}

export interface SlackChannelsResult {
  success: boolean;
  channels?: SlackChannel[];
  workspace?: {
    id: string;
    name: string;
  };
  error?: string;
}

export interface SlackMessage {
  ts: string;
  text: string;
  user: string;
  username?: string;
  channel: {
    id: string;
    name: string;
  };
  permalink?: string;
  timestamp?: number;
}

export interface SlackSearchResult {
  success: boolean;
  messages?: SlackMessage[];
  total?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Notion types (from notion-client.ts)
// ---------------------------------------------------------------------------

export interface NotionConnectionStatus {
  connected: boolean;
  workspace?: {
    id: string;
    name: string;
    icon?: string;
  };
  user?: {
    id: string;
    name: string;
  };
}

export interface NotionSearchResult {
  success: boolean;
  pages?: Array<{
    id: string;
    title: string;
    url?: string;
    icon?: string;
    lastEditedTime?: string;
  }>;
  total?: number;
  hasMore?: boolean;
  nextCursor?: string | null;
  error?: string;
  source?: 'local' | 'api';
}

export interface NotionPageContent {
  success: boolean;
  pageId?: string;
  content?: string;
  blockCount?: number;
  truncated?: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Gmail types (from gmail-client.ts)
// ---------------------------------------------------------------------------

export interface GmailConnectionStatus {
  connected: boolean;
  user?: {
    email: string;
    name?: string;
  };
}

export interface GmailSearchResult {
  success: boolean;
  messages?: Array<{
    id: string;
    threadId: string;
    subject: string;
    from: string;
    snippet: string;
    date: string;
    timestamp?: number;
  }>;
  total?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Context/Search result types
// ---------------------------------------------------------------------------

export interface ContextRelatedItem {
  id: string;
  source: ContextSource | string;
  title: string;
  snippet: string;
  url?: string;
  timestamp?: number;
}

export interface SemanticSearchHandlerResult {
  success: boolean;
  results: unknown[];
  notConnected?: boolean;
  error?: string;
}

export interface ContextGetRelatedResult {
  success: boolean;
  results: ContextRelatedItem[];
  error?: string;
}

// ---------------------------------------------------------------------------
// IPC Invoke Channel Map (ipcMain.handle / ipcRenderer.invoke)
// ---------------------------------------------------------------------------

/**
 * Maps each invoke channel name to its parameter and result types.
 * Usage:
 *   type Params = IpcParams<'create-issue'>;
 *   type Result = IpcResult<'create-issue'>;
 */
export interface IpcInvokeChannelMap {
  // --- Linear ---
  'create-issue': {
    params: {
      title: string;
      description: string;
      teamId: string;
      projectId?: string;
      stateId?: string;
      priority?: number;
      assigneeId?: string;
      estimate?: number;
      cycleId?: string;
      labelIds?: string[];
    };
    result: CreateIssueResult;
  };

  // --- Capture ---
  'close-window': { params: void; result: void };
  'cancel': { params: void; result: void };
  'remove-capture': {
    params: { index: number };
    result: IpcSuccessResponse;
  };
  'add-capture': {
    params: void;
    result: IpcSuccessResponse;
  };
  'reanalyze': {
    params: { filePath: string; model: string; instruction?: string };
    result: IpcSuccessResponse;
  };

  // --- Settings ---
  'get-settings': { params: void; result: Settings };
  'validate-token': {
    params: string;
    result: { valid: boolean; user?: { id: string; name: string; email: string }; error?: string };
  };
  'save-settings': {
    params: { linearApiToken: string; userInfo: SettingsUserInfo };
    result: IpcSuccessResponse;
  };
  'clear-settings': { params: void; result: IpcSuccessResponse };
  'open-settings': { params: void; result: void };
  'close-settings': { params: void; result: void };
  'check-for-updates': { params: void; result: IpcSuccessResponse };
  'get-app-version': { params: void; result: string };

  // --- Hotkey ---
  'get-hotkey': {
    params: void;
    result: {
      hotkey: string;
      displayHotkey: string;
      defaultHotkey: string;
      defaultDisplayHotkey: string;
    };
  };
  'validate-hotkey': {
    params: string;
    result: { valid: boolean; error?: string };
  };
  'save-hotkey': {
    params: string;
    result: { success: boolean; hotkey?: string; displayHotkey?: string; error?: string };
  };
  'reset-hotkey': {
    params: void;
    result: { success: boolean; hotkey?: string; displayHotkey?: string; error?: string };
  };

  // --- Window ---
  'set-traffic-lights-visible': { params: boolean; result: void };

  // --- Slack OAuth ---
  'slack-connect': { params: void; result: IpcSuccessResponse };
  'slack-disconnect': { params: void; result: IpcSuccessResponse };
  'slack-status': {
    params: void;
    result: { connected: boolean; workspace?: string };
  };
  'slack-channels': { params: void; result: SlackChannelsResult };
  'slack-search': {
    params: { query: string; channels?: string[]; count?: number };
    result: SlackSearchResult;
  };

  // --- Notion OAuth ---
  'notion-connect': { params: void; result: IpcSuccessResponse };
  'notion-disconnect': { params: void; result: IpcSuccessResponse };
  'notion-status': {
    params: void;
    result: NotionConnectionStatus;
  };
  'notion-search': {
    params: { query: string; pageSize?: number };
    result: NotionSearchResult;
  };
  'notion-get-content': {
    params: { pageId: string };
    result: NotionPageContent;
  };

  // --- Gmail OAuth ---
  'gmail-connect': { params: void; result: IpcSuccessResponse };
  'gmail-disconnect': { params: void; result: IpcSuccessResponse };
  'gmail-status': {
    params: void;
    result: GmailConnectionStatus;
  };
  'gmail-search': {
    params: { query: string; maxResults?: number };
    result: GmailSearchResult;
  };

  // --- i18n ---
  'get-device-id': { params: void; result: string };
  'get-language': { params: void; result: string };
  'set-language': { params: string; result: { success: boolean } };
  'get-supported-languages': { params: void; result: string[] };
  'translate': {
    params: [key: string, options?: Record<string, unknown>];
    result: string;
  };
  'get-reverse-translation-map': { params: void; result: Record<string, string> };

  // --- Context / Search ---
  'ai-recommend': {
    params: { text: string; limit?: number };
    result: AiRecommendResult;
  };
  'context-semantic-search': {
    params: { query: string; source: string };
    result: SemanticSearchHandlerResult;
  };
  'context.getRelated': {
    params: { query: string; limit?: number };
    result: ContextGetRelatedResult;
  };

  // --- Sync ---
  'sync:get-slack-channels': { params: void; result: SlackChannelInfo[] };
  'sync:set-slack-channels': {
    params: SlackChannelInfo[];
    result: { success: boolean };
  };
  'sync:get-status': { params: void; result: SyncStatus };
  'sync:trigger': {
    params: string;
    result: { success: boolean; error?: string; itemsSynced?: number; itemsFailed?: number };
  };
  'sync:reset-cursor': {
    params: string;
    result: IpcSuccessResponse;
  };
}

// ---------------------------------------------------------------------------
// IPC On Channel Map (fire-and-forget, renderer -> main)
// ---------------------------------------------------------------------------

/**
 * Fire-and-forget channels: renderer sends, main listens (ipcMain.on).
 * No return value.
 */
export interface IpcOnChannelMap {
  'open-screen-capture-settings': { params: void };
  'close-onboarding': { params: void };
  'onboarding-complete': { params: void };
}

// ---------------------------------------------------------------------------
// IPC Event Channel Map (main -> renderer via webContents.send)
// ---------------------------------------------------------------------------

/**
 * Events pushed from main process to renderer (webContents.send).
 */
export interface IpcEventChannelMap {
  'capture-ready': {
    payload: {
      images: CapturedImage[];
      maxImages: number;
      teams: TeamInfo[];
      projects: ProjectInfo[];
      users: LinearUserInfo[];
      states: WorkflowStateInfo[];
      cycles: CycleInfo[];
      labels: LabelInfo[];
      defaultTeamId: string;
      defaultProjectId: string;
      suggestedTitle: string;
      suggestedDescription: string;
      suggestedProjectId: string;
      suggestedAssigneeId: string;
      suggestedPriority: number;
      suggestedEstimate: number;
      userInfo?: SettingsUserInfo;
    };
  };
  'capture-added': {
    payload: {
      index: number;
      filePath: string;
      canAddMore: boolean;
    };
  };
  'capture-removed': {
    payload: {
      index: number;
      remainingCount: number;
      canAddMore: boolean;
    };
  };
  'ai-analysis-ready': {
    payload: AnalysisResult | { success: false; error?: string };
  };
  'settings-updated': { payload: void };
  'linear-data-updated': {
    payload: {
      teams: TeamInfo[];
      projects: ProjectInfo[];
      users: LinearUserInfo[];
      states: WorkflowStateInfo[];
      cycles: CycleInfo[];
      labels: LabelInfo[];
      defaultTeamId: string;
    };
  };
  'hotkey-changed': {
    payload: { hotkey: string; displayHotkey: string };
  };
  'language-changed': { payload: string };
  'sync:progress': {
    payload: {
      source: string;
      phase: string;
      current: number;
      total: number;
    };
  };
  'slack-connected': { payload: { success: boolean; workspace?: { id: string; name: string } } };
  'notion-connected': { payload: { success: boolean; workspace?: { id: string; name: string } } };
  'gmail-connected': { payload: { success: boolean; user?: { email: string; name?: string } } };
  'slack-oauth-error': { payload: { error: string } };
  'notion-oauth-error': { payload: { error: string } };
  'gmail-oauth-error': { payload: { error: string } };
}

// ---------------------------------------------------------------------------
// Type Helpers
// ---------------------------------------------------------------------------

/** All invoke channel names */
export type IpcInvokeChannel = keyof IpcInvokeChannelMap;

/** All fire-and-forget channel names */
export type IpcOnChannel = keyof IpcOnChannelMap;

/** All main-to-renderer event channel names */
export type IpcEventChannel = keyof IpcEventChannelMap;

/** Extract the params type for a given invoke channel */
export type IpcParams<C extends IpcInvokeChannel> = IpcInvokeChannelMap[C]['params'];

/** Extract the result type for a given invoke channel */
export type IpcResult<C extends IpcInvokeChannel> = IpcInvokeChannelMap[C]['result'];

/** Extract the payload type for a given main->renderer event channel */
export type IpcEventPayload<C extends IpcEventChannel> = IpcEventChannelMap[C]['payload'];
