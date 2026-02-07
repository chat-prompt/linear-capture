import { BrowserWindow } from 'electron';
import Store from 'electron-store';
import type { TeamInfo, ProjectInfo, UserInfo, WorkflowStateInfo, CycleInfo, LabelInfo } from '../services/linear-client';
import type { AiAnalyzer } from '../services/ai-analyzer';
import type { SlackService } from '../services/slack-client';
import type { NotionService } from '../services/notion-client';
import type { GmailService } from '../services/gmail-client';
import type { ICaptureService } from '../services/capture';
import type { CaptureSession, OAuthCallback } from '../types/capture';

export interface AppState {
  mainWindow: BrowserWindow | null;
  onboardingWindow: BrowserWindow | null;
  settingsWindow: BrowserWindow | null;
  captureSession: CaptureSession | null;
  isCapturing: boolean;
  teamsCache: TeamInfo[];
  projectsCache: ProjectInfo[];
  usersCache: UserInfo[];
  statesCache: WorkflowStateInfo[];
  cyclesCache: CycleInfo[];
  labelsCache: LabelInfo[];
  geminiAnalyzer: AiAnalyzer | null;
  anthropicAnalyzer: AiAnalyzer | null;
  slackService: SlackService | null;
  notionService: NotionService | null;
  gmailService: GmailService | null;
  captureService: ICaptureService | null;
  pendingSlackCallback: OAuthCallback | null;
  pendingNotionCallback: OAuthCallback | null;
  pendingGmailCallback: OAuthCallback | null;
}

const store = new Store();

const state: AppState = {
  mainWindow: null,
  onboardingWindow: null,
  settingsWindow: null,
  captureSession: null,
  isCapturing: false,
  teamsCache: [],
  projectsCache: [],
  usersCache: [],
  statesCache: [],
  cyclesCache: [],
  labelsCache: [],
  geminiAnalyzer: null,
  anthropicAnalyzer: null,
  slackService: null,
  notionService: null,
  gmailService: null,
  captureService: null,
  pendingSlackCallback: null,
  pendingNotionCallback: null,
  pendingGmailCallback: null,
};

export function getState(): AppState {
  return state;
}

export function getStore(): Store {
  return store;
}
