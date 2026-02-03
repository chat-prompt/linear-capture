import { getDeviceId } from './settings-store';

const WORKER_URL = 'https://linear-capture-ai.ny-4f1.workers.dev';

interface SlackUser {
  id: string;
  name: string;
}

interface SlackUsersResponse {
  success: boolean;
  users?: SlackUser[];
  error?: string;
}

class SlackUserCache {
  private userMap: Map<string, string> = new Map();
  private loaded = false;
  private loading: Promise<void> | null = null;

  async load(): Promise<void> {
    if (this.loaded || this.loading) {
      return this.loading || Promise.resolve();
    }

    this.loading = this._doLoad();
    return this.loading;
  }

  private async _doLoad(): Promise<void> {
    try {
      const deviceId = getDeviceId();
      const url = new URL(`${WORKER_URL}/slack/users`);
      url.searchParams.set('device_id', deviceId);

      const response = await fetch(url.toString());
      const data: SlackUsersResponse = await response.json();

      if (data.success && data.users) {
        this.userMap.clear();
        for (const user of data.users) {
          this.userMap.set(user.id, user.name);
        }
        console.log(`[SlackUserCache] Loaded ${this.userMap.size} users`);
        this.loaded = true;
      } else {
        console.warn('[SlackUserCache] Failed to load users:', data.error);
      }
    } catch (error) {
      console.error('[SlackUserCache] Load error:', error);
    } finally {
      this.loading = null;
    }
  }

  resolve(text: string): string {
    if (!this.loaded || this.userMap.size === 0) {
      return text;
    }

    let resolved = 0;
    const result = text.replace(/<@([A-Z0-9]+)>/g, (match, userId) => {
      const displayName = this.userMap.get(userId);
      if (displayName) {
        resolved++;
        return `@${displayName}`;
      }
      return match;
    });

    if (resolved > 0) {
      console.log(`[SlackUserCache] Resolved ${resolved} mentions`);
    }

    return result;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  clear(): void {
    this.userMap.clear();
    this.loaded = false;
    this.loading = null;
  }
}

export const slackUserCache = new SlackUserCache();
