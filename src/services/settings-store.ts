/**
 * Settings Store - 사용자 설정 저장소
 *
 * electron-store를 사용하여 설정을 저장합니다.
 * ⚠️ DMG 패키징 안정성을 위해 암호화 없이 평문 저장합니다.
 */

import Store from 'electron-store';

export interface UserInfo {
  id: string;
  name: string;
  email: string;
}

export interface Settings {
  linearApiToken?: string;
  userInfo?: UserInfo;
  defaultTeamId?: string;
  captureHotkey?: string;  // 기본값: 'CommandOrControl+Shift+L'
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
 * 모든 설정 가져오기
 */
export function getAllSettings(): Settings {
  return {
    linearApiToken: settingsStore.get('linearApiToken'),
    userInfo: settingsStore.get('userInfo'),
    defaultTeamId: settingsStore.get('defaultTeamId'),
    captureHotkey: settingsStore.get('captureHotkey'),
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

/**
 * 기본 단축키 가져오기
 */
export function getDefaultHotkey(): string {
  return DEFAULT_HOTKEY;
}
