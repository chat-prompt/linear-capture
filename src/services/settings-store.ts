/**
 * Settings Store - 사용자 설정 저장소
 *
 * electron-store를 사용하여 설정을 저장합니다.
 * ⚠️ DMG 패키징 안정성을 위해 암호화 없이 평문 저장합니다.
 */

import Store from 'electron-store';
import * as crypto from 'crypto';
import { app } from 'electron';

export interface UserInfo {
  id: string;
  name: string;
  email: string;
}

export interface SlackChannelInfo {
  id: string;
  name: string;
}

export type SyncInterval = 'off' | '5m' | '15m' | '30m' | '1h' | '6h' | '24h';

export interface Settings {
  linearApiToken?: string;
  userInfo?: UserInfo;
  defaultTeamId?: string;
  captureHotkey?: string;
  deviceId?: string;
  language?: string;
  openaiApiKey?: string;
  selectedSlackChannels?: SlackChannelInfo[];
  syncInterval?: SyncInterval;
}

const DEFAULT_HOTKEY = 'CommandOrControl+Shift+L';

// ⚠️ encryptionKey 사용 안 함 (DMG 패키징 문제 방지)
const settingsStore = new Store<Settings>({
  name: 'settings',
});

/**
 * Linear API 토큰 가져오기
 * 저장된 토큰 우선, 없으면 .env fallback
 */
export function getLinearToken(): string | undefined {
  const storedToken = settingsStore.get('linearApiToken');
  return storedToken || process.env.LINEAR_API_TOKEN;
}

/**
 * Linear API 토큰 저장
 */
export function setLinearToken(token: string): void {
  settingsStore.set('linearApiToken', token);
}

/**
 * Linear API 토큰 삭제
 */
export function clearLinearToken(): void {
  settingsStore.delete('linearApiToken');
  settingsStore.delete('userInfo');
}

/**
 * 토큰 존재 여부 확인
 */
export function hasToken(): boolean {
  const token = getLinearToken();
  return !!token && token.length > 0;
}

/**
 * 사용자 정보 가져오기
 */
export function getUserInfo(): UserInfo | undefined {
  return settingsStore.get('userInfo');
}

/**
 * 사용자 정보 저장
 */
export function setUserInfo(user: UserInfo): void {
  settingsStore.set('userInfo', user);
}

/**
 * 기본 팀 ID 가져오기
 */
export function getDefaultTeamId(): string | undefined {
  return settingsStore.get('defaultTeamId') || process.env.DEFAULT_TEAM_ID;
}

/**
 * 기본 팀 ID 저장
 */
export function setDefaultTeamId(teamId: string): void {
  settingsStore.set('defaultTeamId', teamId);
}

/**
 * OpenAI API 키 가져오기
 * 저장된 키 우선, 없으면 .env fallback
 */
export function getOpenaiApiKey(): string | undefined {
  const storedKey = settingsStore.get('openaiApiKey');
  return storedKey || process.env.OPENAI_API_KEY;
}

/**
 * OpenAI API 키 저장
 */
export function setOpenaiApiKey(key: string): void {
  settingsStore.set('openaiApiKey', key);
}

/**
 * OpenAI API 키 삭제
 */
export function clearOpenaiApiKey(): void {
  settingsStore.delete('openaiApiKey');
}

/**
 * 모든 설정 가져오기
 */
export function getAllSettings(): Settings {
  return {
    linearApiToken: settingsStore.get('linearApiToken'),
    userInfo: settingsStore.get('userInfo'),
    defaultTeamId: settingsStore.get('defaultTeamId'),
    captureHotkey: settingsStore.get('captureHotkey'),
    deviceId: settingsStore.get('deviceId'),
    language: settingsStore.get('language'),
    openaiApiKey: settingsStore.get('openaiApiKey'),
  };
}

/**
 * 캡처 단축키 가져오기
 */
export function getCaptureHotkey(): string {
  return settingsStore.get('captureHotkey') || DEFAULT_HOTKEY;
}

/**
 * 캡처 단축키 저장
 */
export function setCaptureHotkey(hotkey: string): void {
  settingsStore.set('captureHotkey', hotkey);
}

/**
 * 캡처 단축키 기본값으로 리셋
 */
export function resetCaptureHotkey(): void {
  settingsStore.delete('captureHotkey');
}

export function getDefaultHotkey(): string {
  return DEFAULT_HOTKEY;
}

export function getDeviceId(): string {
  let deviceId = settingsStore.get('deviceId');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    settingsStore.set('deviceId', deviceId);
  }
  return deviceId;
}

const SUPPORTED_LANGUAGES = ['en', 'ko', 'de', 'fr', 'es'] as const;
type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export function getSupportedLanguages(): readonly string[] {
  return SUPPORTED_LANGUAGES;
}

export function getLanguage(): string {
  const stored = settingsStore.get('language') as string | undefined;
  if (stored && SUPPORTED_LANGUAGES.includes(stored as SupportedLanguage)) {
    return stored;
  }
  const locale = app.getLocale();
  const lang = locale.split('-')[0];
  return SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage) ? lang : 'en';
}

export function setLanguage(lang: string): void {
  if (SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)) {
    settingsStore.set('language', lang);
  }
}

/**
 * 선택된 Slack 채널 목록 가져오기
 */
export function getSelectedSlackChannels(): SlackChannelInfo[] {
  return settingsStore.get('selectedSlackChannels') || [];
}

/**
 * 선택된 Slack 채널 목록 저장
 */
export function setSelectedSlackChannels(channels: SlackChannelInfo[]): void {
  settingsStore.set('selectedSlackChannels', channels);
}

/**
 * 선택된 Slack 채널 목록 초기화
 */
export function clearSelectedSlackChannels(): void {
  settingsStore.delete('selectedSlackChannels');
}

const SYNC_INTERVAL_MS: Record<SyncInterval, number> = {
  'off': 0,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

export function getSyncInterval(): SyncInterval {
  return settingsStore.get('syncInterval') || 'off';
}

export function setSyncInterval(interval: SyncInterval): void {
  settingsStore.set('syncInterval', interval);
}

export function getSyncIntervalMs(): number {
  return SYNC_INTERVAL_MS[getSyncInterval()];
}
