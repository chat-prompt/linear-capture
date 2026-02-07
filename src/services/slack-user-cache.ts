import { getDeviceId } from './settings-store';
import { WORKER_BASE_URL } from './config';
import { logger } from './utils/logger';

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
      const url = new URL(`${WORKER_BASE_URL}/slack/users`);
      url.searchParams.set('device_id', deviceId);

      const response = await fetch(url.toString());
      const data: SlackUsersResponse = await response.json();

      if (data.success && data.users) {
        this.userMap.clear();
        for (const user of data.users) {
          this.userMap.set(user.id, user.name);
        }
        logger.info(`[SlackUserCache] Loaded ${this.userMap.size} users`);
        this.loaded = true;
      } else {
        logger.warn('[SlackUserCache] Failed to load users:', data.error);
      }
    } catch (error) {
      logger.error('[SlackUserCache] Load error:', error);
    } finally {
      this.loading = null;
    }
  }

  resolve(text: string): string {
    logger.info('[SlackUserCache.resolve] input:', text);
    let result = text;

    // 1. 사용자 멘션 (userMap 필요 - 조건부)
    if (this.loaded && this.userMap.size > 0) {
      let resolved = 0;
      result = result.replace(/<@([A-Z0-9]+)>/g, (match, userId) => {
        const displayName = this.userMap.get(userId);
        if (displayName) {
          resolved++;
          return `@${displayName}`;
        }
        return match;
      });
      if (resolved > 0) {
        logger.info(`[SlackUserCache] Resolved ${resolved} mentions`);
      }
    }

    // 2. 채널 멘션 (이름 있는 경우만)
    result = result.replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1');

    // 3. 특수 멘션
    result = result.replace(/<!here>/g, '@here');
    result = result.replace(/<!channel>/g, '@channel');
    result = result.replace(/<!everyone>/g, '@everyone');

    // 4. 링크 (텍스트 있는 경우 → 마크다운)
    result = result.replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, '[$2]($1)');
    // 링크 (텍스트 없는 경우 → URL만 추출)
    result = result.replace(/<(https?:\/\/[^>]+)>/g, '$1');

    // 5. DM 채널 title (# + 유저ID) → @유저명
    // 전체 문자열이 #U... 형태인 경우만 (DM title)
    // 일반 채널명 (#general)은 소문자 포함이므로 매칭 안 됨
    if (this.loaded && this.userMap.size > 0) {
      result = result.replace(/^#([A-Z][A-Z0-9]+)$/, (match, userId) => {
        const displayName = this.userMap.get(userId);
        if (displayName) {
          logger.info(`[SlackUserCache] Resolved DM title: ${match} → @${displayName}`);
          return `@${displayName}`;
        }
        return match;
      });
    }

    logger.info('[SlackUserCache.resolve] output:', result);
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
