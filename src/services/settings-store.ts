import Store from 'electron-store';
import { LinearClient } from '@linear/sdk';

export interface UserInfo {
  id: string;
  name: string;
  email: string;
}

export interface ValidateTokenResult {
  valid: boolean;
  user?: UserInfo;
  error?: string;
}

export interface SettingsData {
  linearApiToken?: string;
  userInfo?: UserInfo;
}

// Encryption key for secure token storage
const ENCRYPTION_KEY = 'linear-capture-secure-storage-key-v1';

// Create encrypted store for sensitive data
const settingsStore = new Store<SettingsData>({
  name: 'settings',
  encryptionKey: ENCRYPTION_KEY,
});

/**
 * Get stored Linear API token
 */
export function getLinearToken(): string | undefined {
  return settingsStore.get('linearApiToken');
}

/**
 * Save Linear API token to secure storage
 */
export function setLinearToken(token: string): void {
  settingsStore.set('linearApiToken', token);
}

/**
 * Remove stored Linear API token
 */
export function clearLinearToken(): void {
  settingsStore.delete('linearApiToken');
  settingsStore.delete('userInfo');
}

/**
 * Check if a valid token is stored
 */
export function hasToken(): boolean {
  const token = getLinearToken();
  return !!token && token.length > 0;
}

/**
 * Get stored user info
 */
export function getUserInfo(): UserInfo | undefined {
  return settingsStore.get('userInfo');
}

/**
 * Save user info to storage
 */
export function setUserInfo(user: UserInfo): void {
  settingsStore.set('userInfo', user);
}

/**
 * Validate a Linear API token by calling the viewer API
 */
export async function validateToken(token: string): Promise<ValidateTokenResult> {
  try {
    const client = new LinearClient({ apiKey: token });
    const viewer = await client.viewer;

    if (!viewer) {
      return { valid: false, error: 'Failed to fetch user info' };
    }

    const user: UserInfo = {
      id: viewer.id,
      name: viewer.name,
      email: viewer.email,
    };

    return { valid: true, user };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid token';
    return { valid: false, error: message };
  }
}
