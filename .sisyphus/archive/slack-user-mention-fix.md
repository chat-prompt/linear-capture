# Slack 유저 멘션 표시 개선

## TL;DR

> **Quick Summary**: Slack 메시지의 `<@U04M2VCUU4C>` 형태 유저 ID를 `@실제이름` 으로 변환하여 표시
> 
> **Deliverables**:
> - Worker `/slack/users` 엔드포인트 추가
> - 클라이언트 `SlackUserCache` 서비스 생성
> - SemanticSearchService 결과 변환 통합
> 
> **Estimated Effort**: Quick (2-3시간)
> **Parallel Execution**: NO - sequential
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4

---

## Context

### 현재 상황

Slack 메시지 검색 결과에서 유저 멘션이 ID 형태로 표시됨:
```
<@U04M2VCUU4C> <@U09V6BG8V25> 리니어 캡처 앱 출시 전 지표 수집 계획을...
```

기대하는 결과:
```
@김철수 @이영희 리니어 캡처 앱 출시 전 지표 수집 계획을...
```

### 이미 완료된 작업

- ✅ Worker `/slack/history` 엔드포인트에 `resolveUserMentions()` 추가 (새로 동기화되는 메시지)
- ✅ Worker 배포 완료

### 남은 문제

1. **기존 DB 데이터**: 이미 저장된 메시지는 변환 전 상태로 저장되어 있음
2. **일회성 해결 한계**: DB 삭제 후 재동기화는 사용자에게 불편
3. **이중 안전장치 필요**: Worker 변환 실패 시 클라이언트에서 처리

### 해결 전략

**표시 시점 변환**: 검색 결과를 반환하기 직전에 클라이언트에서 유저 멘션을 변환
- 기존 저장된 데이터도 올바르게 표시됨
- DB 삭제 없이 즉시 적용 가능
- Worker 변환 실패 시 백업 역할

---

## 저장소 구조 (중요!)

> ⚠️ **Worker와 Client는 별도 저장소입니다**

| 저장소 | 경로 | 역할 |
|--------|------|------|
| **linear-capture** (클라이언트) | `/Users/wine_ny/side-project/linear_project/linear-capture/` | Electron 앱 |
| **linear-capture-worker** | `/Users/wine_ny/side-project/linear_project/linear-capture-worker/` | Cloudflare Worker |

---

## Work Objectives

### Core Objective

검색 결과 표시 시점에 Slack 유저 멘션을 실제 이름으로 변환

### Concrete Deliverables

1. **Worker**: `GET /slack/users` 엔드포인트 (`src/slack/users.ts`)
2. **Client**: `src/services/slack-user-cache.ts` 서비스
3. **Client**: `src/services/semantic-search.ts` 변환 로직 통합
4. **Client**: `src/main/index.ts` 초기화 로직

### Definition of Done

- [ ] 기존 저장된 데이터도 `@실제이름` 형태로 표시됨
- [ ] 새로 동기화되는 데이터도 올바르게 표시됨
- [ ] DB 삭제 없이 즉시 적용됨
- [ ] Slack 연결 안 된 경우 graceful degradation

### Must NOT Have (Guardrails)

- ❌ UI 코드 수정 금지 (renderer 파일 수정 안 함)
- ❌ 기존 SemanticSearchService 인터페이스 변경 금지
- ❌ 매 검색마다 `/slack/users` API 호출 금지 (캐싱 필수)
- ❌ 유저 캐시 미로드 시 에러 발생 금지 (원본 반환)

---

## Verification Strategy

### Test Decision

- **Infrastructure exists**: YES (vitest)
- **User wants tests**: Manual verification (Quick task)
- **QA approach**: 터미널 로그 + 앱 UI 확인

### Manual Verification Procedure

```bash
# 1. Worker 배포 후 엔드포인트 테스트
curl "https://linear-capture-ai.ny-4f1.workers.dev/slack/users?device_id=test-device-id"
# Expected: { "success": true, "users": [{ "id": "U...", "name": "..." }, ...] }

# 2. 앱 실행
cd /Users/wine_ny/side-project/linear_project/linear-capture
npm run pack:clean

# 3. 로그 확인 (앱 시작 시)
# Expected: [SlackUserCache] Loaded N users

# 4. 캡처 → 분석 → 검색 결과에서 멘션 확인
# Before: <@U04M2VCUU4C>
# After: @김철수

# 5. 변환 로그 확인
# Expected: [SemanticSearch] Resolved N user mentions in M results
```

---

## Execution Strategy

### Dependency Matrix

| Task | Depends On | Blocks | Location |
|------|------------|--------|----------|
| 1 | None | 2 | Worker 저장소 |
| 2 | 1 | 3, 4 | Client 저장소 |
| 3 | 2 | None | Client 저장소 |
| 4 | 2 | None | Client 저장소 |

**Note**: Task 3, 4는 Task 2 완료 후 병렬 가능하지만, 동일 저장소라 순차 진행 권장

---

## TODOs

### Task 1. Worker에 `/slack/users` 엔드포인트 추가

> **⚠️ 작업 위치**: `linear-capture-worker` 저장소  
> **절대 경로**: `/Users/wine_ny/side-project/linear_project/linear-capture-worker/`

**What to do**:

1. `src/slack/users.ts` 파일 생성
2. Slack `users.list` API 호출하여 유저 목록 반환
3. `src/index.ts`에 라우팅 추가

**구현 상세**:

```typescript
// src/slack/users.ts
import { getTokens, type TokenStorageEnv } from '../oauth/token-storage.js';

const SLACK_USERS_URL = 'https://slack.com/api/users.list';

export interface SlackUser {
  id: string;
  name: string;
  real_name?: string;
  profile?: {
    display_name?: string;
    real_name?: string;
  };
}

export interface SlackEnv extends TokenStorageEnv {
  SLACK_CLIENT_ID: string;
  SLACK_CLIENT_SECRET: string;
}

export async function handleSlackUsers(
  request: Request,
  env: SlackEnv,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get('device_id');

  if (!deviceId) {
    return new Response(
      JSON.stringify({ success: false, error: 'device_id is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const tokens = await getTokens(env, deviceId, 'slack');
  if (!tokens) {
    return new Response(
      JSON.stringify({ success: false, error: 'Not connected to Slack' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const response = await fetch(SLACK_USERS_URL, {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` },
    });

    const data = await response.json() as {
      ok: boolean;
      members?: SlackUser[];
      error?: string;
    };

    if (!data.ok) {
      return new Response(
        JSON.stringify({ success: false, error: data.error || 'Failed to fetch users' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const users = (data.members || []).map(user => ({
      id: user.id,
      name: user.profile?.display_name || user.profile?.real_name || user.real_name || user.name,
    }));

    return new Response(
      JSON.stringify({ success: true, users }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Slack users error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
```

**Must NOT do**:
- 페이지네이션 구현 (users.list는 대부분의 워크스페이스에서 한 번에 반환)
- 토큰 갱신 로직 (기존 패턴과 동일하게 에러 반환)

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []
- **Reason**: 기존 패턴을 따르는 단순한 API 엔드포인트 추가

**References (정확한 라인 번호)**:

| 참조 파일 | 라인 | 설명 |
|-----------|------|------|
| `src/slack/history.ts:16-33` | fetchUserMap 함수 | 유저 목록 조회 패턴 재사용 |
| `src/vectorize/slack.ts:51-83` | fetchUserMap 함수 | 동일 패턴 (중복 코드) |
| `src/index.ts:118-120` | `/slack/history` 라우팅 | 새 라우팅 추가 위치 |
| `src/slack/oauth.ts` | SlackEnv 타입 | 환경 타입 참조 |

**Acceptance Criteria**:

```bash
# 1. Worker 빌드 성공
cd /Users/wine_ny/side-project/linear_project/linear-capture-worker
npm run build
# Expected: 에러 없이 완료

# 2. Worker 배포
npm run deploy
# Expected: 배포 성공 메시지

# 3. API 테스트 (실제 device_id 필요)
curl "https://linear-capture-ai.ny-4f1.workers.dev/slack/users?device_id=YOUR_DEVICE_ID"
# Expected: { "success": true, "users": [{ "id": "U...", "name": "..." }, ...] }

# 4. 미연결 상태 테스트
curl "https://linear-capture-ai.ny-4f1.workers.dev/slack/users?device_id=invalid"
# Expected: { "success": false, "error": "Not connected to Slack" }
```

**Commit**: YES
- Message: `feat(worker): add /slack/users endpoint for user mention resolution`
- Files: `src/slack/users.ts`, `src/index.ts`

---

### Task 2. 클라이언트에 유저 캐시 서비스 추가

> **⚠️ 작업 위치**: `linear-capture` 저장소  
> **절대 경로**: `/Users/wine_ny/side-project/linear_project/linear-capture/`

**What to do**:

1. `src/services/slack-user-cache.ts` 생성
2. Worker `/slack/users` 호출하여 유저 목록 캐싱
3. `resolveUserMentions(text)` 함수 제공

**구현 상세**:

```typescript
// src/services/slack-user-cache.ts
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
```

**Must NOT do**:
- 주기적 갱신 로직 (앱 시작 시 1회만 로드)
- 로컬 파일 저장 (메모리 캐시만)
- 캐시 미로드 시 에러 throw (원본 반환)

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**References (정확한 라인 번호)**:

| 참조 파일 | 라인 | 설명 |
|-----------|------|------|
| `src/services/slack-client.ts:69-95` | SlackService 클래스 | 서비스 패턴 참조 |
| `src/services/slack-client.ts:4` | WORKER_URL 상수 | URL 패턴 |
| `src/services/settings-store.ts:133-140` | getDeviceId() | deviceId 가져오기 |

**Acceptance Criteria**:

```bash
# 1. TypeScript 컴파일 성공
cd /Users/wine_ny/side-project/linear_project/linear-capture
npm run build
# Expected: 에러 없이 완료

# 2. 타입 체크
npx tsc --noEmit
# Expected: 에러 없이 완료
```

**Commit**: NO (Task 3, 4와 함께 커밋)

---

### Task 3. SemanticSearchService에 변환 로직 통합

> **⚠️ 작업 위치**: `linear-capture` 저장소

**What to do**:

1. `slackUserCache` import 추가
2. `convertHybridResults()` 메서드에서 Slack 소스 결과에 변환 적용
3. 변환 결과 로깅

**구현 상세**:

```typescript
// src/services/semantic-search.ts 수정

// 상단에 import 추가 (line 4 이후)
import { slackUserCache } from './slack-user-cache';

// convertHybridResults 메서드 수정 (line 115-124)
private convertHybridResults(results: HybridSearchResult[]): SearchResult[] {
  let resolvedCount = 0;

  const converted = results.map(r => {
    let content = r.content;

    // Slack 소스인 경우 유저 멘션 변환
    if (r.source === 'slack' && slackUserCache.isLoaded()) {
      const originalContent = content;
      content = slackUserCache.resolve(content);
      if (content !== originalContent) {
        resolvedCount++;
      }
    }

    return {
      id: r.id,
      source: r.source,
      title: r.title || '',
      content,
      url: r.url,
      score: r.score
    };
  });

  if (resolvedCount > 0) {
    console.log(`[SemanticSearch] Resolved user mentions in ${resolvedCount} results`);
  }

  return converted;
}
```

**Must NOT do**:
- `search()` 메서드 시그니처 변경
- 다른 소스(notion, gmail)에 변환 적용
- 캐시 미로드 시 에러 발생

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**References (정확한 라인 번호)**:

| 참조 파일 | 라인 | 설명 |
|-----------|------|------|
| `src/services/semantic-search.ts:1-4` | import 섹션 | 새 import 추가 위치 |
| `src/services/semantic-search.ts:115-124` | convertHybridResults() | 변환 로직 추가 위치 |
| `src/services/semantic-search.ts:89-113` | search() 메서드 | convertHybridResults 호출 위치 확인 |

**Acceptance Criteria**:

```bash
# 1. TypeScript 컴파일 성공
npm run build
# Expected: 에러 없이 완료

# 2. 앱 실행 후 검색 테스트
# Expected 로그: [SemanticSearch] Resolved user mentions in N results
```

**Commit**: NO (Task 4와 함께 커밋)

---

### Task 4. 앱 시작 시 유저 캐시 초기화

> **⚠️ 작업 위치**: `linear-capture` 저장소

**What to do**:

1. `slackUserCache` import 추가
2. `searchService.syncSlack()` 이후 유저 캐시 로드
3. OAuth 완료 시에도 캐시 갱신

**구현 상세**:

```typescript
// src/main/index.ts 수정

// 상단 import 추가 (line 42 근처, getSemanticSearchService 다음)
import { slackUserCache } from '../services/slack-user-cache';

// 앱 시작 로직 수정 (line 1344-1353 근처)
const searchService = getSemanticSearchService();
searchService.initialize().then(async (success) => {
  if (!success) {
    console.error('[Main] Failed to initialize local search');
    return;
  }
  
  // Slack 동기화
  searchService.syncSlack().catch(error => {
    console.error('[Main] Slack sync failed:', error);
  });

  // 유저 캐시 로드 (Slack 연결 여부 확인 후)
  const slackStatus = await slackService?.getConnectionStatus();
  if (slackStatus?.connected) {
    slackUserCache.load().catch(error => {
      console.error('[Main] Slack user cache load failed:', error);
    });
  }
});

// OAuth 완료 시 캐시 갱신 (line 94-104 근처, 기존 syncSlack 다음에 추가)
if (result.success) {
  settingsWindow?.webContents.send('slack-connected', result);
  console.log('[Main] Slack OAuth complete, triggering sync...');
  const searchService = getSemanticSearchService();
  searchService.initialize().then(() => {
    searchService.syncSlack().catch(err => {
      console.error('[Main] Post-OAuth Slack sync failed:', err);
    });
    
    // 유저 캐시 갱신
    slackUserCache.load().catch(err => {
      console.error('[Main] Post-OAuth user cache load failed:', err);
    });
  });
}
```

**Must NOT do**:
- 동기 로딩 (앱 시작 차단)
- Slack 미연결 시 에러 발생
- 기존 로직 제거 또는 변경

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: []

**References (정확한 라인 번호)**:

| 참조 파일 | 라인 | 설명 |
|-----------|------|------|
| `src/main/index.ts:42` | import 섹션 | 새 import 추가 위치 |
| `src/main/index.ts:94-104` | OAuth 콜백 처리 | 캐시 갱신 추가 위치 |
| `src/main/index.ts:1344-1353` | SemanticSearch 초기화 | 캐시 로드 추가 위치 |
| `src/main/index.ts:942` | slackService 변수 | 연결 상태 확인용 |

**Acceptance Criteria**:

```bash
# 1. TypeScript 컴파일 성공
npm run build
# Expected: 에러 없이 완료

# 2. 앱 실행 후 로그 확인
npm run pack:clean
# Expected 로그: [SlackUserCache] Loaded N users

# 3. Slack 재연결 후 캐시 갱신 확인
# Settings > Slack > Disconnect > Connect
# Expected 로그: [SlackUserCache] Loaded N users (다시 출력)
```

**Commit**: YES
- Message: `feat(search): resolve slack user mentions in search results`
- Files: 
  - `src/services/slack-user-cache.ts`
  - `src/services/semantic-search.ts`
  - `src/main/index.ts`

---

## Commit Strategy

| After Task | Message | Files | 저장소 |
|------------|---------|-------|--------|
| 1 | `feat(worker): add /slack/users endpoint for user mention resolution` | `src/slack/users.ts`, `src/index.ts` | linear-capture-worker |
| 2-4 | `feat(search): resolve slack user mentions in search results` | `slack-user-cache.ts`, `semantic-search.ts`, `main/index.ts` | linear-capture |

---

## Success Criteria

### Final Checklist

- [ ] `<@U04M2VCUU4C>` → `@실제이름` 변환됨
- [ ] 기존 저장된 데이터도 올바르게 표시
- [ ] DB 삭제 없이 적용됨
- [ ] 앱 시작 시 유저 캐시 자동 로드
- [ ] Slack 미연결 시 에러 없이 원본 표시
- [ ] OAuth 재연결 시 캐시 갱신

### Verification Commands

```bash
# Worker 테스트
curl "https://linear-capture-ai.ny-4f1.workers.dev/slack/users?device_id=YOUR_DEVICE_ID"

# 앱 빌드 & 실행
cd /Users/wine_ny/side-project/linear_project/linear-capture
npm run pack:clean

# 로그 확인 포인트
# - [SlackUserCache] Loaded N users (앱 시작 시)
# - [SemanticSearch] Resolved user mentions in N results (검색 시)
```

---

## Rollback Plan

문제 발생 시:

1. **클라이언트 롤백**: `slack-user-cache.ts` import 제거, `semantic-search.ts` 원복
2. **Worker 롤백**: `/slack/users` 라우팅 제거 (다른 기능에 영향 없음)

기존 기능에 영향을 주지 않는 additive 변경이므로 롤백 리스크 낮음.
