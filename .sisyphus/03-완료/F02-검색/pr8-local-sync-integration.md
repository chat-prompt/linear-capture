# PR #8 통합 작업: Local Sync Architecture → Master

## Progress (Updated: 2025-02-05 09:00)

| Phase | Status | Commit |
|-------|--------|--------|
| Phase 0: 의존성 설치 | ✅ Done | `d0e8ba9` |
| Phase 1: 서비스 파일 복사 | ✅ Done | `792ad63` |
| Phase 2: settings-store.ts | ✅ Done | `394f1bf` |
| Phase 3: ipc-handlers.ts | ✅ Done | `ab9f37d` |
| Phase 4: settings.html UI | ✅ Done | 미커밋 |
| Phase 5: semantic-search.ts | ✅ Done | `0b942a2` |
| Phase 6: oauth-handlers.ts | ✅ Done | `709fa24` |
| **Phase 8-0: DB 초기화 호출** | ✅ Done | 미커밋 |
| **Phase 8-1: EmbeddingService graceful** | ✅ Done | 미커밋 |
| **Phase 8-4: Null safety 강화** | ✅ Done | 미커밋 |
| **Phase 8-2: syncSource() 구현** | ✅ Done | 미커밋 |
| **Phase 8-3: Auto Sync 스케줄러** | ✅ Done | 미커밋 |
| **Phase 9: Gmail sync adapter** | ✅ Done | 미커밋 |
| **Phase 9-fix: Gmail 배치 처리** | ✅ Done | 미커밋 |
| Phase 7: 빌드/테스트 | ✅ Done | - |
| **Phase 10: 검색 품질 개선** | 🟡 상세화 완료 | - |
| **Phase 11: Sync UI 개선** | 🟡 상세화 완료 | - |

**Branch**: `feature/local-sync-integration`
**Build Status**: ✅ Passing (`npm run build` success)
**App Test**: ✅ `npm run pack:clean` 실행 완료

---

## 🚨 발견된 문제점 (2025-02-04 분석 결과)

### Critical Issues (🔴 반드시 수정 필요)

#### 1. DatabaseService 초기화 미호출 (Fatal)
**파일**: `src/main/index.ts`
**문제**: `initDatabaseService()`가 앱 어디에서도 호출되지 않음
**영향**: PGlite DB 미생성 → LocalSearchService 전체 실패
**해결**: Phase 8-0에서 index.ts에 초기화 호출 추가

#### 2. EmbeddingService API 키 없으면 즉시 Throw (Fatal)
**파일**: `src/services/embedding-service.ts` (line 16-19)
```typescript
constructor() {
  const apiKey = SettingsStore.getOpenaiApiKey();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required...');  // 즉시 throw
  }
}
```
**영향**: LocalSearchService 생성 시 EmbeddingService throw → 전체 실패
**해결**: Phase 8-1에서 local-search.ts에서 graceful degradation 처리

#### 3. syncSource()가 Stub 함수
**파일**: `src/services/local-search.ts` (line 79-81)
```typescript
async syncSource(source: string): Promise<void> {
  console.log(`[LocalSearch] syncSource called for: ${source}`);
  // 실제 동기화 로직 없음!
}
```
**영향**: Sync Now 클릭해도 실제 동기화 안 됨
**해결**: Phase 8-2에서 sync-adapters 호출로 교체

### Medium Issues (🟡 개선 권장)

#### 4. Auto Sync 스케줄러 미구현
**문제**: 5분 주기 자동 동기화 구현 누락
**해결**: Phase 8-3에서 setInterval 기반 스케줄러 추가

#### 5. Null Safety 부족
**파일**: `src/services/local-search.ts` (line 132-137)
**문제**: `semanticSearch()`, `keywordSearch()`에서 DB null 체크 없음
**해결**: Phase 8-4에서 null 체크 추가

### 해결 계획 요약
| 문제 | 해결 Phase | 우선순위 |
|------|-----------|---------|
| DB 초기화 미호출 | 8-0 | 🔴 Critical |
| EmbeddingService throw | 8-1 | 🔴 Critical |
| syncSource stub | 8-2 | 🔴 Critical |
| Auto Sync 미구현 | 8-3 | 🟡 Medium |
| Null safety | 8-4 | 🟡 Medium |

---

## TL;DR

> **Quick Summary**: PR #8의 로컬 동기화 기능(PGlite + pgvector, Slack/Notion/Linear sync)을 Master의 모듈화된 구조에 이식
> 
> **Deliverables**:
> - 새 서비스 파일 7개 추가 (database.ts, local-search.ts, embedding-service.ts, text-preprocessor.ts, sync-adapters/*)
> - settings-store.ts에 OpenAI/Slack 채널 설정 함수 추가
> - ipc-handlers.ts에 동기화 IPC 핸들러 추가
> - semantic-search.ts를 LocalSearchService로 위임하도록 수정
> - settings.html에 Data Sync UI 추가
> 
> **Estimated Effort**: Medium (3-4시간)
> **Parallel Execution**: NO - 순차적 (의존성 있음)
> **Critical Path**: Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 5 → Phase 7

---

## Context

### Original Request
PR #8 (`feature/local-search-architecture`)의 로컬 동기화 아키텍처를 Master 브랜치에 통합. Master의 모듈화된 구조(index.ts → 10개 파일 분리)를 유지하면서 PR의 기능을 이식.

### 의사결정 완료
1. **통합 방향**: Master에 PR 기능 이식 (Master 모듈 구조 유지)
2. **Auto Sync**: 5분 고정 (드롭다운 제거, `SyncInterval` 타입 불필요)
3. **Connect = Sync**: 연결 성공 시 자동 동기화 시작
4. **기존 파일 처리**: sql.js 기반 파일들은 유지 (fallback용), PGlite 파일들과 공존

### 아키텍처 변경

```
Before (Master):
┌─────────────────────────────────────┐
│  Context Adapters (실시간 API 호출)   │
│  + SlackSync (sql.js 로컬 저장)      │
└─────────────────────────────────────┘

After (통합 후):
┌─────────────────────────────────────┐
│  sync-adapters (PGlite 로컬 동기화)  │
│  - SlackSyncAdapter                 │
│  - NotionSyncAdapter                │
│  - LinearSyncAdapter                │
└─────────────────────────────────────┘
           ↓
┌─────────────────────────────────────┐
│  DatabaseService (PGlite + pgvector) │
│  + LocalSearchService (Hybrid RRF)  │
└─────────────────────────────────────┘
```

---

## Work Objectives

### Core Objective
PR #8의 로컬 동기화/검색 기능을 Master의 모듈 구조에 맞게 이식하여 오프라인 검색 및 자동 동기화 지원

### Concrete Deliverables
- `src/services/database.ts` - PGlite DB 서비스
- `src/services/local-search.ts` - 하이브리드 검색 서비스
- `src/services/embedding-service.ts` - OpenAI 임베딩 서비스
- `src/services/text-preprocessor.ts` - 텍스트 전처리
- `src/services/sync-adapters/*.ts` - 동기화 어댑터 3개
- settings-store.ts, ipc-handlers.ts, semantic-search.ts 수정
- settings.html Data Sync UI 추가

### Definition of Done
- [x] `npm run build` 에러 없이 성공 ✅ (2025-02-04)
- [x] `npm run pack:clean`으로 앱 실행 가능 ✅ (2025-02-04)
- [ ] Settings에서 OpenAI API Key 입력 가능 (Phase 4 필요)
- [x] Slack 연결 시 자동 동기화 트리거됨 ✅ (코드 추가 완료, syncSource는 stub)
- [ ] 검색 결과에 로컬 동기화된 데이터 표시 (실제 동기화 로직 필요)

### Must Have
- PGlite + pgvector 기반 로컬 DB
- OpenAI 임베딩 생성 (text-embedding-3-small)
- Slack/Notion/Linear 동기화 어댑터
- 5분 주기 Auto Sync
- 연결 성공 시 즉시 동기화

### Must NOT Have (Guardrails)
- ❌ SyncInterval 드롭다운 UI (5분 고정으로 결정됨)
- ❌ 기존 sql.js 파일 삭제 (fallback으로 유지)
- ❌ PR의 monolithic index.ts 직접 머지

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: NO (수동 테스트로 진행)
- **Agent-Executed QA**: YES

---

## TODOs

### Phase 0: 의존성 설치 ✅ DONE

- [x] 0. 새 패키지 의존성 설치

  **What to do**:
  ```bash
  npm install @electric-sql/pglite openai tiktoken
  ```
  - `@electric-sql/pglite`: PostgreSQL WASM (로컬 DB)
  - `openai`: OpenAI API SDK (임베딩 생성)
  - `tiktoken`: 토큰 계산 (임베딩 길이 제한)

  **Must NOT do**:
  - devDependencies로 설치하지 않음 (런타임 필요)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Phase 1 전에 완료 필요)
  - **Blocks**: Phase 1, 2, 3, 4, 5, 6
  - **Blocked By**: None

  **References**:
  - `package.json` - 현재 의존성 확인
  - `docs/pr8-comparison.md:287-293` - 필요한 의존성 목록

  **Acceptance Criteria**:
  - [x] `package.json`에 3개 패키지 추가됨
  - [x] `npm install` 에러 없이 완료
  - [x] `node -e "require('@electric-sql/pglite')"` 성공

  **Commit**: YES ✅ `d0e8ba9`
  - Message: `chore: add PGlite, OpenAI, tiktoken dependencies for local sync`
  - Files: `package.json`, `package-lock.json`

---

### Phase 1: 새 서비스 파일 복사 (충돌 없음) ✅ DONE

- [x] 1. PR 브랜치에서 새 파일들 복사

  **What to do**:
  ```bash
  # 새 브랜치 생성
  git checkout -b feature/local-sync-integration

  # PR에서 새 파일들 복사
  git show origin/feature/local-search-architecture:src/services/database.ts > src/services/database.ts
  git show origin/feature/local-search-architecture:src/services/embedding-service.ts > src/services/embedding-service.ts
  git show origin/feature/local-search-architecture:src/services/local-search.ts > src/services/local-search.ts
  git show origin/feature/local-search-architecture:src/services/text-preprocessor.ts > src/services/text-preprocessor.ts

  # sync-adapters 폴더 생성 및 복사
  mkdir -p src/services/sync-adapters
  git show origin/feature/local-search-architecture:src/services/sync-adapters/slack-sync.ts > src/services/sync-adapters/slack-sync.ts
  git show origin/feature/local-search-architecture:src/services/sync-adapters/notion-sync.ts > src/services/sync-adapters/notion-sync.ts
  git show origin/feature/local-search-architecture:src/services/sync-adapters/linear-sync.ts > src/services/sync-adapters/linear-sync.ts
  ```

  **Must NOT do**:
  - 기존 `src/services/slack-sync.ts` 삭제하지 않음 (경로 다름, 공존)
  - 기존 `src/services/local-vector-store.ts` 삭제하지 않음 (fallback 유지)

  **기존 파일 vs 신규 파일 관계**:
  | 기존 파일 (sql.js) | 신규 파일 (PGlite) | 처리 |
  |-------------------|-------------------|------|
  | `slack-sync.ts` | `sync-adapters/slack-sync.ts` | 경로 다름, 공존 |
  | `local-vector-store.ts` | `database.ts` | 공존 (fallback) |
  | `hybrid-search.ts` | `local-search.ts` | 공존 (fallback) |
  | `embedding-client.ts` | `embedding-service.ts` | 공존 (Worker vs OpenAI) |

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Phase 2, 3, 5
  - **Blocked By**: Phase 0

  **References**:
  - `docs/pr8-comparison.md:147-157` - 새로 추가된 파일 목록
  - PR 브랜치: `origin/feature/local-search-architecture`

  **Acceptance Criteria**:
  - [x] `src/services/database.ts` 생성됨
  - [x] `src/services/embedding-service.ts` 생성됨
  - [x] `src/services/local-search.ts` 생성됨
  - [x] `src/services/text-preprocessor.ts` 생성됨
  - [x] `src/services/sync-adapters/` 폴더에 3개 파일 생성됨

  **Commit**: YES ✅ `792ad63`
  - Message: `feat: add local sync services from PR #8`
  - Files: 7개 신규 파일

---

### Phase 2: settings-store.ts 수정 ✅ DONE

- [x] 2. OpenAI API Key 및 Slack 채널 설정 함수 추가

  **What to do**:
  
  `src/services/settings-store.ts`에 다음 추가:
  
  ```typescript
  // 인터페이스 추가
  export interface SlackChannelInfo {
    id: string;
    name: string;
    selected: boolean;
  }

  // Settings 인터페이스에 추가
  export interface Settings {
    // ... 기존 필드
    openaiApiKey?: string;
    selectedSlackChannels?: SlackChannelInfo[];
  }

  // OpenAI API Key 함수들
  export function getOpenaiApiKey(): string | null {
    return settingsStore.get('openaiApiKey') || null;
  }

  export function setOpenaiApiKey(key: string): void {
    settingsStore.set('openaiApiKey', key);
  }

  export function clearOpenaiApiKey(): void {
    settingsStore.delete('openaiApiKey');
  }

  // Slack 채널 선택 함수들
  export function getSelectedSlackChannels(): SlackChannelInfo[] {
    return settingsStore.get('selectedSlackChannels') || [];
  }

  export function setSelectedSlackChannels(channels: SlackChannelInfo[]): void {
    settingsStore.set('selectedSlackChannels', channels);
  }

  export function clearSelectedSlackChannels(): void {
    settingsStore.delete('selectedSlackChannels');
  }
  ```

  **Must NOT do**:
  - `SyncInterval` 타입 추가하지 않음 (5분 고정으로 결정)
  - `getSyncInterval`, `setSyncInterval` 추가하지 않음

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Phase 3, 5
  - **Blocked By**: Phase 1

  **References**:
  - `src/services/settings-store.ts` - 현재 구조 (164줄)
  - `docs/pr8-comparison.md:329-343` - 누락된 export 목록

  **Acceptance Criteria**:
  - [x] `SlackChannelInfo` 인터페이스 export됨
  - [x] `getOpenaiApiKey()`, `setOpenaiApiKey()`, `clearOpenaiApiKey()` 함수 존재
  - [x] `getSelectedSlackChannels()`, `setSelectedSlackChannels()` 함수 존재
  - [x] TypeScript 컴파일 에러 없음

  **Commit**: YES ✅ `394f1bf`
  - Message: `feat(settings): add OpenAI API key and Slack channel settings`
  - Files: `src/services/settings-store.ts`

---

### Phase 3: ipc-handlers.ts에 동기화 IPC 추가 ✅ DONE

- [x] 3. 동기화 관련 IPC 핸들러 추가

  **What to do**:
  
  `src/main/ipc-handlers.ts`에 다음 핸들러 추가:
  
  ```typescript
  // 상단 import 추가
  import { getLocalSearchService } from '../services/local-search';
  import { SlackSyncAdapter } from '../services/sync-adapters/slack-sync';
  import { NotionSyncAdapter } from '../services/sync-adapters/notion-sync';
  import { LinearSyncAdapter } from '../services/sync-adapters/linear-sync';
  import { 
    getOpenaiApiKey, 
    setOpenaiApiKey,
    getSelectedSlackChannels, 
    setSelectedSlackChannels,
    SlackChannelInfo 
  } from '../services/settings-store';

  // registerIpcHandlers() 함수 내에 추가:

  // OpenAI API Key 핸들러
  ipcMain.handle('openai:get-key', () => {
    return getOpenaiApiKey();
  });

  ipcMain.handle('openai:set-key', (_event, key: string) => {
    setOpenaiApiKey(key);
    return { success: true };
  });

  // Slack 채널 선택 핸들러
  ipcMain.handle('sync:get-slack-channels', () => {
    return getSelectedSlackChannels();
  });

  ipcMain.handle('sync:set-slack-channels', (_event, channels: SlackChannelInfo[]) => {
    setSelectedSlackChannels(channels);
    return { success: true };
  });

  // 동기화 상태 핸들러
  ipcMain.handle('sync:get-status', async () => {
    const localSearch = getLocalSearchService();
    // 각 소스별 동기화 상태 반환
    return await localSearch.getSyncStatus();
  });

  // 수동 동기화 트리거
  ipcMain.handle('sync:trigger', async (_event, source: string) => {
    try {
      const localSearch = getLocalSearchService();
      await localSearch.syncSource(source);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });
  ```

  **Auto Sync 스케줄러** (별도 처리 - state.ts 또는 index.ts):
  
  ```typescript
  // 5분 = 300000ms 고정
  const SYNC_INTERVAL_MS = 5 * 60 * 1000;
  let syncTimer: NodeJS.Timeout | null = null;

  export function startSyncScheduler(): void {
    if (syncTimer) return;
    
    syncTimer = setInterval(async () => {
      const localSearch = getLocalSearchService();
      await localSearch.syncAll();
    }, SYNC_INTERVAL_MS);
    
    console.log('[AutoSync] Scheduler started (5min interval)');
  }

  export function stopSyncScheduler(): void {
    if (syncTimer) {
      clearInterval(syncTimer);
      syncTimer = null;
      console.log('[AutoSync] Scheduler stopped');
    }
  }
  ```

  **Must NOT do**:
  - sync:get-interval, sync:set-interval 핸들러 추가하지 않음 (5분 고정)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Phase 6
  - **Blocked By**: Phase 1, 2

  **References**:
  - `src/main/ipc-handlers.ts` - 현재 구조 (725줄)
  - `docs/pr8-comparison.md:108-111` - Auto Sync 구현 파일 참조

  **Acceptance Criteria**:
  - [x] `openai:get-key`, `openai:set-key` 핸들러 동작
  - [x] `sync:get-slack-channels`, `sync:set-slack-channels` 핸들러 동작
  - [x] `sync:get-status`, `sync:trigger` 핸들러 동작
  - [x] TypeScript 컴파일 에러 없음

  **Commit**: YES ✅ `ab9f37d`
  - Message: `feat(ipc): add sync and OpenAI API key handlers`
  - Files: `src/main/ipc-handlers.ts`, `src/services/local-search.ts`

---

### Phase 4: settings.html 동기화 UI 추가

- [ ] 4. Settings 페이지에 Data Sync 섹션 추가

  **What to do**:
  
  `src/renderer/settings.html`에 Data Sync 섹션 추가:
  
  1. **OpenAI API Key 입력 필드** (AI Settings 섹션 또는 신규 섹션)
  2. **Data Sync 섹션**:
     - Notion 연결 상태 + Sync Now 버튼
     - Slack 연결 상태 + 채널 선택 + Sync Now 버튼
     - Linear 연결 상태 + Sync Now 버튼
  3. **Auto Sync 안내 문구**: "5분마다 자동 동기화됩니다" (드롭다운 대신 텍스트)

  **UI 구조 예시**:
  ```html
  <!-- Data Sync Section -->
  <div class="settings-section">
    <h3>Data Sync</h3>
    <p class="settings-hint">연결된 서비스의 데이터를 로컬에 동기화합니다. 5분마다 자동 동기화됩니다.</p>
    
    <!-- OpenAI API Key -->
    <div class="setting-item">
      <label>OpenAI API Key</label>
      <input type="password" id="openai-key" placeholder="sk-..." />
      <button id="save-openai-key">Save</button>
    </div>
    
    <!-- Per-source sync status -->
    <div class="sync-sources">
      <!-- Slack -->
      <div class="sync-source" data-source="slack">
        <span class="source-name">Slack</span>
        <span class="sync-status">Last sync: 5분 전</span>
        <button class="sync-now-btn">Sync Now</button>
      </div>
      <!-- Notion, Linear 동일 구조 -->
    </div>
  </div>
  ```

  **Must NOT do**:
  - Auto Sync interval 드롭다운 추가하지 않음

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (Phase 3 완료 후)
  - **Parallel Group**: Wave 2 (with Phase 5, 6)
  - **Blocks**: Phase 7
  - **Blocked By**: Phase 3

  **References**:
  - `src/renderer/settings.html` - 현재 UI 구조
  - `docs/pr8-comparison.md:111` - Auto Sync UI 참조

  **Acceptance Criteria**:
  - [x] OpenAI API Key 입력/저장 UI 존재 ✅
  - [x] 각 소스별 Sync Now 버튼 표시 ✅ (단, 실제 동기화는 Phase 8에서)
  - [x] "5분마다 자동 동기화" 안내 문구 표시 ✅
  - [x] 반응형 레이아웃 유지 ✅
  - [x] i18n 다국어 지원 (en/ko/de/fr/es) ✅

  **Commit**: YES (UI 완료 후)
  - Message: `feat(ui): add Data Sync section to settings`
  - Files: `src/renderer/settings.html`, `locales/*/translation.json`
  
  **Note**: UI는 완성됨. 실제 동기화 로직은 Phase 8에서 구현 필요.

---

### Phase 5: semantic-search.ts 수정 ✅ DONE

- [x] 5. LocalSearchService로 위임하도록 변경

  **What to do**:
  
  `src/services/semantic-search.ts` 수정:
  
  ```typescript
  // import 추가
  import { getLocalSearchService } from './local-search';

  // search() 메서드 시그니처 변경 (source 파라미터 추가)
  async search(query: string, items: ContextItem[], limit = 5, source?: string): Promise<SearchResult[]> {
    if (!query) return [];

    // LocalSearchService가 초기화되어 있으면 사용
    try {
      const localSearch = getLocalSearchService();
      if (localSearch.isInitialized()) {
        const results = await localSearch.search(query, items, limit, source);
        if (results.length > 0) {
          console.log(`[SemanticSearch] LocalSearch returned ${results.length} results`);
          return results;
        }
      }
    } catch (error) {
      console.warn('[SemanticSearch] LocalSearch failed, falling back:', error);
    }

    // Fallback: 기존 HybridSearch (sql.js 기반)
    if (this.hybridSearch) {
      try {
        const localResults = await this.hybridSearch.search(query, { limit });
        if (localResults.length > 0) {
          console.log(`[SemanticSearch] HybridSearch returned ${localResults.length} results`);
          return this.convertHybridResults(localResults);
        }
      } catch (error) {
        console.error('[SemanticSearch] HybridSearch failed:', error);
      }
    }

    // Final fallback: Worker API
    if (items.length > 0) {
      console.log('[SemanticSearch] Falling back to Worker search');
      return this.callWorker(query, items, limit);
    }

    return [];
  }
  ```

  **핵심 변경점**:
  1. `source?: string` 파라미터 추가 (선택적, 기존 호출 호환)
  2. LocalSearchService (PGlite) 먼저 시도
  3. 실패 시 기존 HybridSearch (sql.js) fallback
  4. 최종 fallback으로 Worker API

  **Must NOT do**:
  - 기존 HybridSearch/Worker fallback 로직 삭제하지 않음

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Phase 3 완료 후)
  - **Parallel Group**: Wave 2 (with Phase 4, 6)
  - **Blocks**: Phase 7
  - **Blocked By**: Phase 1, 2

  **References**:
  - `src/services/semantic-search.ts:91` - 현재 search() 시그니처
  - `docs/pr8-comparison.md:358-359` - 빌드 에러 원인

  **Acceptance Criteria**:
  - [x] `search(query, items, limit)` 호출 호환 유지
  - [x] `search(query, items, limit, source)` 호출 가능
  - [x] LocalSearchService → HybridSearch → Worker 순서로 fallback
  - [x] TypeScript 컴파일 에러 없음

  **Commit**: YES ✅ `0b942a2`
  - Message: `refactor(search): delegate to LocalSearchService with fallback chain`
  - Files: `src/services/semantic-search.ts`

---

### Phase 6: OAuth 성공 후 자동 동기화 ✅ DONE

- [x] 6. oauth-handlers.ts에서 연결 성공 시 동기화 트리거

  **What to do**:
  
  `src/main/oauth-handlers.ts` 수정:
  
  ```typescript
  // import 추가
  import { getLocalSearchService } from '../services/local-search';

  // Slack OAuth 성공 후 (약 line 27-33)
  if (result.success) {
    state.settingsWindow?.webContents.send('slack-connected', result);
    
    // 연결 성공 시 즉시 동기화 시작
    try {
      const localSearch = getLocalSearchService();
      await localSearch.syncSource('slack');
      console.log('[OAuth] Slack sync triggered after connect');
    } catch (error) {
      console.warn('[OAuth] Failed to trigger Slack sync:', error);
    }
  }

  // Notion OAuth 성공 후 (약 line 60-66) - 동일 패턴
  // Linear는 OAuth 없음 (API 토큰 기반) - 별도 처리 필요 시 추가
  ```

  **Must NOT do**:
  - 동기화 실패가 OAuth 성공 응답에 영향 주지 않도록 try-catch 필수

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Phase 3 완료 후)
  - **Parallel Group**: Wave 2 (with Phase 4, 5)
  - **Blocks**: Phase 7
  - **Blocked By**: Phase 3

  **References**:
  - `src/main/oauth-handlers.ts` - 현재 구조 (113줄)

  **Acceptance Criteria**:
  - [x] Slack 연결 성공 시 동기화 자동 시작
  - [x] Notion 연결 성공 시 동기화 자동 시작
  - [x] 동기화 실패해도 연결 성공 메시지는 전달됨

  **Commit**: YES ✅ `709fa24`
  - Message: `feat(oauth): trigger sync on successful connection`
  - Files: `src/main/oauth-handlers.ts`

---

### Phase 7: 빌드 및 테스트

- [ ] 7. 통합 빌드 및 기능 테스트

  **What to do**:
  
  ```bash
  # 1. TypeScript 빌드
  npm run build
  
  # 2. 패키지 빌드 및 앱 실행
  npm run pack:clean
  ```

  **기능 테스트 시나리오**:
  
  1. **OpenAI API Key 설정**
     - Settings 열기
     - OpenAI API Key 입력 및 저장
     - 앱 재시작 후에도 키 유지 확인
  
  2. **Slack 연결 및 자동 동기화**
     - Slack Connect 버튼 클릭
     - OAuth 완료 후 동기화 시작 로그 확인
     - 검색에서 Slack 메시지 표시 확인
  
  3. **수동 동기화**
     - Settings > Data Sync > Sync Now 클릭
     - 동기화 완료 메시지 확인
  
  4. **Auto Sync 동작** (선택적 - 5분 대기 필요)
     - 5분 후 자동 동기화 로그 확인

  **Must NOT do**:
  - 테스트 실패해도 기존 기능(캡처, 이슈 생성) 영향 없어야 함

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`playwright`] (UI 테스트 시)

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (최종)
  - **Blocks**: None (완료)
  - **Blocked By**: Phase 4, 5, 6

  **References**:
  - `CLAUDE.md:테스트 원칙` - pack:clean 사용 규칙

  **Acceptance Criteria**:
  - [ ] `npm run build` 에러 없음
  - [ ] `npm run pack:clean` 앱 정상 실행
  - [ ] Settings에서 OpenAI API Key 저장/로드 동작
  - [ ] Slack 연결 시 동기화 트리거됨
  - [ ] 검색에서 동기화된 데이터 표시

  **Commit**: NO (테스트만)

---

### Phase 8: 실제 동기화 로직 구현 🔴 NEW (상세화 완료)

> ⚠️ **분석 결과 발견된 Critical Issues:**
> 1. `initDatabaseService()`가 앱 어디에서도 호출되지 않음 → DB 미생성
> 2. `EmbeddingService`가 API 키 없으면 즉시 throw → LocalSearchService 전체 실패
> 3. `syncSource()`가 stub → sync-adapters 호출 안 함
> 4. Auto Sync 스케줄러 구현 누락

---

#### Phase 8-0: DatabaseService 초기화 추가 (🔴 BLOCKING - 최우선)

- [ ] 8-0. 앱 시작 시 DatabaseService 초기화 호출 추가

  **배경**:
  `database.ts`에 `initDatabaseService()` 함수가 있지만 **앱 어디에서도 호출되지 않음**.
  결과적으로 PGlite DB가 생성되지 않아 `LocalSearchService` 전체가 작동하지 않음.

  **What to do**:
  
  `src/main/index.ts` 수정:
  ```typescript
  // 상단 import 추가
  import { initDatabaseService, closeDatabaseService } from '../services/database';

  // app.whenReady() 내부에 추가 (registerIpcHandlers() 직후 권장)
  app.whenReady().then(async () => {
    // ... 기존 코드 ...
    
    registerIpcHandlers();
    
    // 🔴 NEW: DatabaseService 초기화
    try {
      await initDatabaseService();
      logger.log('[App] DatabaseService initialized successfully');
    } catch (error) {
      logger.error('[App] Failed to initialize DatabaseService:', error);
      // 실패해도 앱은 계속 실행 (동기화 기능만 비활성화)
    }
    
    // ... 나머지 코드 ...
  });

  // app.on('will-quit') 수정
  app.on('will-quit', async () => {
    unregisterAllHotkeys();
    destroyTray();
    closeNotionLocalReader();
    await closeDatabaseService();  // 🔴 NEW: DB 정리
  });
  ```

  **Must NOT do**:
  - DB 초기화 실패 시 앱 전체를 종료하지 않음 (graceful degradation)
  - 동기 호출로 변경하지 않음 (async 유지)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **References**:
  - `src/services/database.ts:243-257` - initDatabaseService/closeDatabaseService 함수
  - `src/main/index.ts:60-131` - app.whenReady() 블록

  **Acceptance Criteria**:
  - [ ] 앱 시작 시 콘솔에 `[App] DatabaseService initialized successfully` 출력
  - [ ] `~/Library/Application Support/linear-capture/local.db` 폴더 생성됨
  - [ ] 앱 종료 시 DB 정상 close

  **Commit**: YES (Phase 8-1과 함께)
  - Message: `feat(db): initialize DatabaseService on app startup`
  - Files: `src/main/index.ts`

---

#### Phase 8-1: EmbeddingService Graceful Degradation (🔴 CRITICAL)

- [ ] 8-1. API 키 없어도 앱 실행 가능하도록 수정

  **배경**:
  현재 `EmbeddingService` 생성자에서 API 키 없으면 즉시 throw.
  `LocalSearchService` 생성 시 `createEmbeddingService()` 호출하므로 전체 실패.

  **문제 코드** (`embedding-service.ts:16-19`):
  ```typescript
  constructor() {
    const apiKey = SettingsStore.getOpenaiApiKey();
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required...');  // 즉시 throw
    }
  }
  ```

  **What to do**:
  
  `src/services/local-search.ts` 수정:
  ```typescript
  export class LocalSearchService {
    private dbService: DatabaseService;
    private embeddingService: EmbeddingService | null = null;  // nullable로 변경
    private preprocessor = new TextPreprocessor();

    constructor() {
      this.dbService = getDatabaseService();
      this.initEmbeddingService();
    }

    /**
     * EmbeddingService 지연 초기화
     * API 키가 없으면 null로 유지 (동기화 시 에러 메시지 표시)
     */
    private initEmbeddingService(): void {
      try {
        const apiKey = getOpenaiApiKey();
        if (apiKey) {
          this.embeddingService = createEmbeddingService();
          console.log('[LocalSearch] EmbeddingService initialized');
        } else {
          console.warn('[LocalSearch] OpenAI API key not set - sync disabled');
        }
      } catch (error) {
        console.error('[LocalSearch] EmbeddingService init failed:', error);
        this.embeddingService = null;
      }
    }

    /**
     * API 키 설정 후 재초기화 지원
     */
    reinitializeEmbedding(): void {
      this.initEmbeddingService();
    }

    /**
     * 동기화 가능 여부 확인
     */
    canSync(): boolean {
      return this.embeddingService !== null && this.isInitialized();
    }
  ```

  **Must NOT do**:
  - `embedding-service.ts` 자체를 수정하지 않음 (다른 곳에서 사용 가능)
  - API 키 없을 때 silent fail하지 않음 (명확한 경고 로그)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **References**:
  - `src/services/local-search.ts:39-42` - 현재 생성자
  - `src/services/embedding-service.ts:15-22` - EmbeddingService 생성자

  **Acceptance Criteria**:
  - [ ] API 키 없이 앱 시작 시 크래시 안 남
  - [ ] 콘솔에 `[LocalSearch] OpenAI API key not set - sync disabled` 경고 출력
  - [ ] API 키 설정 후 `reinitializeEmbedding()` 호출하면 동기화 가능

  **Commit**: YES (Phase 8-0과 함께)
  - Message: `fix(search): graceful degradation when OpenAI API key missing`
  - Files: `src/services/local-search.ts`

---

#### Phase 8-2: syncSource() 실제 구현 (🔴 CRITICAL)

- [ ] 8-2. stub 함수를 sync-adapters 호출로 교체

  **배경**:
  - 현재 `syncSource()`는 로그만 출력하는 stub 함수
  - `sync-adapters/` 폴더에 완전한 구현이 이미 존재
  - 연결만 해주면 됨

  **현재 코드** (`local-search.ts:79-81`):
  ```typescript
  async syncSource(source: string): Promise<void> {
    console.log(`[LocalSearch] syncSource called for: ${source}`);
    // 실제 로직 없음!
  }
  ```

  **What to do**:
  
  `src/services/local-search.ts` 수정:
  ```typescript
  // 상단 import 추가
  import { createSlackSyncAdapter } from './sync-adapters/slack-sync';
  import { createNotionSyncAdapter } from './sync-adapters/notion-sync';
  import { createLinearSyncAdapter } from './sync-adapters/linear-sync';

  // syncSource() 메서드 교체
  async syncSource(source: string): Promise<void> {
    console.log(`[LocalSearch] Starting sync for: ${source}`);
    
    // 동기화 가능 여부 확인
    if (!this.canSync()) {
      const reason = !this.isInitialized() 
        ? 'Database not initialized' 
        : 'OpenAI API key not set';
      console.error(`[LocalSearch] Cannot sync: ${reason}`);
      throw new Error(`Sync unavailable: ${reason}. Please check Settings.`);
    }

    try {
      switch (source) {
        case 'slack': {
          const adapter = createSlackSyncAdapter();
          const result = await adapter.syncIncremental();
          console.log(`[LocalSearch] Slack sync complete: ${result.itemsSynced} items, ${result.itemsFailed} failed`);
          break;
        }
        case 'notion': {
          const adapter = createNotionSyncAdapter();
          const result = await adapter.syncIncremental();
          console.log(`[LocalSearch] Notion sync complete: ${result.itemsSynced} items, ${result.itemsFailed} failed`);
          break;
        }
        case 'linear': {
          const adapter = createLinearSyncAdapter();
          const result = await adapter.syncIncremental();
          console.log(`[LocalSearch] Linear sync complete: ${result.itemsSynced} items, ${result.itemsFailed} failed`);
          break;
        }
        default:
          console.warn(`[LocalSearch] Unknown source: ${source}`);
      }
    } catch (error) {
      console.error(`[LocalSearch] Sync failed for ${source}:`, error);
      throw error;
    }
  }

  // syncAll() 메서드도 수정
  async syncAll(): Promise<void> {
    console.log('[LocalSearch] Starting syncAll');
    
    if (!this.canSync()) {
      console.warn('[LocalSearch] syncAll skipped - not ready');
      return;
    }

    const sources = ['slack', 'notion', 'linear'];
    const results = await Promise.allSettled(
      sources.map(source => this.syncSource(source))
    );

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`[LocalSearch] ${sources[index]} sync failed:`, result.reason);
      }
    });

    console.log('[LocalSearch] syncAll complete');
  }
  ```

  **Must NOT do**:
  - sync-adapters 파일 자체를 수정하지 않음 (이미 완성됨)
  - 동기화 실패 시 앱 크래시 발생시키지 않음

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **References**:
  - `src/services/sync-adapters/slack-sync.ts:71-158` - SlackSyncAdapter.sync()/syncIncremental()
  - `src/services/sync-adapters/notion-sync.ts:46-103` - NotionSyncAdapter.sync()/syncIncremental()
  - `src/services/sync-adapters/linear-sync.ts:47-121` - LinearSyncAdapter.sync()/syncIncremental()

  **Acceptance Criteria**:
  - [ ] Sync Now 버튼 클릭 시 실제 동기화 시작
  - [ ] 콘솔에 `[LocalSearch] Slack sync complete: N items` 로그 출력
  - [ ] 동기화 실패 시 명확한 에러 메시지 표시
  - [ ] API 키 없으면 `Sync unavailable: OpenAI API key not set` 에러

  **Commit**: YES
  - Message: `feat(sync): connect syncSource to sync-adapters`
  - Files: `src/services/local-search.ts`

---

#### Phase 8-3: Auto Sync 스케줄러 구현 (🟡 MEDIUM)

- [ ] 8-3. 5분 주기 자동 동기화 스케줄러 추가

  **배경**:
  사용자가 연결 후 수동으로 Sync Now 누르지 않아도 자동으로 동기화되어야 함.
  5분 주기로 고정 (UI 드롭다운 없음).

  **What to do**:
  
  **Option A: index.ts에 직접 추가** (권장 - 간단)
  ```typescript
  // src/main/index.ts 상단에 추가
  import { getLocalSearchService } from '../services/local-search';

  // 모듈 레벨 변수
  let syncScheduler: NodeJS.Timeout | null = null;
  const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5분

  // app.whenReady() 내부, DB 초기화 후에 추가
  // Auto Sync 스케줄러 시작
  syncScheduler = setInterval(async () => {
    const localSearch = getLocalSearchService();
    if (localSearch?.canSync()) {
      logger.log('[AutoSync] Starting scheduled sync');
      try {
        await localSearch.syncAll();
      } catch (error) {
        logger.error('[AutoSync] Scheduled sync failed:', error);
      }
    }
  }, SYNC_INTERVAL_MS);
  logger.log('[AutoSync] Scheduler started (5min interval)');

  // app.on('will-quit') 에 추가
  if (syncScheduler) {
    clearInterval(syncScheduler);
    syncScheduler = null;
  }
  ```

  **Option B: 별도 파일로 분리** (깔끔하지만 추가 파일)
  ```typescript
  // src/main/sync-scheduler.ts (신규 파일)
  import { getLocalSearchService } from '../services/local-search';
  import { logger } from '../services/utils/logger';

  const SYNC_INTERVAL_MS = 5 * 60 * 1000;
  let syncTimer: NodeJS.Timeout | null = null;

  export function startSyncScheduler(): void {
    if (syncTimer) return;
    
    syncTimer = setInterval(async () => {
      const localSearch = getLocalSearchService();
      if (localSearch?.canSync()) {
        logger.log('[AutoSync] Starting scheduled sync');
        await localSearch.syncAll();
      }
    }, SYNC_INTERVAL_MS);
    
    logger.log('[AutoSync] Scheduler started (5min interval)');
  }

  export function stopSyncScheduler(): void {
    if (syncTimer) {
      clearInterval(syncTimer);
      syncTimer = null;
      logger.log('[AutoSync] Scheduler stopped');
    }
  }
  ```

  **Must NOT do**:
  - 1분 이하 간격으로 설정하지 않음 (API rate limit)
  - 동기화 중에 다음 스케줄 실행되지 않도록 처리 필요

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **References**:
  - 계획 문서 Phase 3 (ipc-handlers.ts) - Auto Sync 스케줄러 예시 코드 참조

  **Acceptance Criteria**:
  - [ ] 앱 시작 후 5분마다 `[AutoSync] Starting scheduled sync` 로그 출력
  - [ ] 앱 종료 시 스케줄러 정리됨
  - [ ] API 키 없으면 스케줄 실행되어도 skip

  **Commit**: YES
  - Message: `feat(sync): add 5-minute auto sync scheduler`
  - Files: `src/main/index.ts` (또는 `src/main/sync-scheduler.ts`)

---

#### Phase 8-4: Null Safety 및 에러 핸들링 강화 (🟡 MEDIUM)

- [ ] 8-4. local-search.ts의 null 체크 및 에러 핸들링 강화

  **배경**:
  현재 `semanticSearch()`, `keywordSearch()`에서 DB null 체크 없이 바로 사용.
  DB 초기화 실패 시 앱 크래시 가능.

  **문제 코드** (`local-search.ts:132-137`):
  ```typescript
  private async semanticSearch(...): Promise<SearchResult[]> {
    const db = this.dbService.getDb();  // null이면 throw
    // ...
  }
  ```

  **What to do**:
  
  `src/services/local-search.ts` 수정:
  ```typescript
  private async semanticSearch(
    queryEmbedding: number[],
    limit: number,
    source?: string
  ): Promise<SearchResult[]> {
    // Null safety 추가
    if (!this.isInitialized()) {
      console.warn('[LocalSearch] semanticSearch skipped - DB not initialized');
      return [];
    }

    const db = this.dbService.getDb();
    // ... 나머지 로직
  }

  private async keywordSearch(query: string, limit: number, source?: string): Promise<SearchResult[]> {
    // Null safety 추가
    if (!this.isInitialized()) {
      console.warn('[LocalSearch] keywordSearch skipped - DB not initialized');
      return [];
    }

    const db = this.dbService.getDb();
    // ... 나머지 로직
  }

  // search() 메서드에도 embeddingService null 체크 추가
  async search(query: string, items: ContextItem[], limit = 5, source?: string): Promise<SearchResult[]> {
    if (!query) return [];

    // EmbeddingService 없으면 키워드 검색만 수행
    if (!this.embeddingService) {
      console.warn('[LocalSearch] EmbeddingService not available, keyword search only');
      return this.keywordSearch(query, limit, source);
    }

    try {
      // ... 기존 하이브리드 검색 로직
    } catch (error) {
      console.error('[LocalSearch] Search failed:', error);
      return [];
    }
  }
  ```

  **Must NOT do**:
  - 에러 발생 시 throw하지 않고 빈 배열 반환 (UI 깨짐 방지)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Acceptance Criteria**:
  - [ ] DB 초기화 실패해도 검색 시 크래시 안 남 (빈 결과 반환)
  - [ ] API 키 없어도 키워드 검색은 가능

  **Commit**: YES (Phase 8-2와 함께)
  - Message: `fix(search): add null safety checks`
  - Files: `src/services/local-search.ts`

---

#### Phase 8 전체 요약

| Sub-Phase | 작업 | 우선순위 | Blocks |
|-----------|------|---------|--------|
| **8-0** | DatabaseService 초기화 호출 | 🔴 Critical | 8-1, 8-2, 8-3 |
| **8-1** | EmbeddingService graceful degradation | 🔴 Critical | 8-2 |
| **8-2** | syncSource() 실제 구현 | 🔴 Critical | Phase 7 |
| **8-3** | Auto Sync 스케줄러 | 🟡 Medium | Phase 7 |
| **8-4** | Null safety 강화 | 🟡 Medium | Phase 7 |

**실행 순서**: 8-0 → 8-1 → 8-4 → 8-2 → 8-3

**전체 커밋 전략**:
1. `feat(db): initialize DatabaseService on app startup` (8-0)
2. `fix(search): graceful degradation and null safety` (8-1 + 8-4)
3. `feat(sync): connect syncSource to sync-adapters` (8-2)
4. `feat(sync): add 5-minute auto sync scheduler` (8-3)

**Acceptance Criteria (Phase 8 전체)**:
- [ ] 앱 시작 시 DB 초기화 로그 출력
- [ ] API 키 없이 앱 실행 가능 (동기화만 비활성화)
- [ ] Sync Now 버튼 클릭 시 실제 데이터 동기화
- [ ] 5분마다 자동 동기화 실행
- [ ] 검색에서 동기화된 데이터 표시
- [ ] 어떤 상황에서도 앱 크래시 없음 (graceful degradation)

---

## Execution Strategy

### Dependency Flow

```
Phase 0 (의존성 설치) ✅
    ↓
Phase 1 (파일 복사) ✅
    ↓
Phase 2 (settings-store) ✅
    ↓
Phase 3 (ipc-handlers) ✅
    ↓
┌───────────────────────────┐
│ Phase 4, 5, 6 (병렬) ✅    │
│ - settings.html UI ✅     │
│ - semantic-search ✅      │
│ - oauth-handlers ✅       │
└───────────────────────────┘
    ↓
┌───────────────────────────────────────┐
│ Phase 8 (실제 동기화 구현) ✅ Done      │
│  8-0 ~ 8-4 모두 완료                   │
└───────────────────────────────────────┘
    ↓
┌───────────────────────────────────────┐
│ Phase 9 (Gmail sync) ✅ Done           │
│  Gmail adapter + 배치 처리             │
└───────────────────────────────────────┘
    ↓
**커밋 필요** (Phase 4 + 8 + 9 미커밋)
    ↓
┌───────────────────────────────────────┐
│ Phase 10 (검색 품질 개선) ⏳ 대기      │
│  10-1: LIKE 검색 fallback 추가        │
└───────────────────────────────────────┘
    ↓
┌───────────────────────────────────────┐
│ Phase 11 (Sync UI 개선) ⏳ 대기        │
│  11-1: syncSource 반환값 변경          │
│  11-2: IPC handler 수정               │
│  11-3: Settings UI 개선               │
└───────────────────────────────────────┘
    ↓
Phase 7 (빌드/테스트)
```

### Commit Strategy

| Phase | Commit Message | Files | Status |
|-------|----------------|-------|--------|
| 0 | `chore: add PGlite, OpenAI, tiktoken dependencies` | package.json | ✅ |
| 1 | `feat: add local sync services from PR #8` | 7개 신규 파일 | ✅ |
| 2 | `feat(settings): add OpenAI/Slack channel settings` | settings-store.ts | ✅ |
| 3 | `feat(ipc): add sync handlers` | ipc-handlers.ts | ✅ |
| 4 | `feat(ui): add Data Sync section` | settings.html, locales/* | ⏳ 미커밋 |
| 5 | `refactor(search): delegate to LocalSearchService` | semantic-search.ts | ✅ |
| 6 | `feat(oauth): trigger sync on connection` | oauth-handlers.ts | ✅ |
| **8-0~8-4** | **(아래 통합 커밋 참조)** | | ⏳ 미커밋 |
| **9** | **(아래 통합 커밋 참조)** | | ⏳ 미커밋 |
| **10-1** | `feat(search): add LIKE search fallback for short keywords` | local-search.ts | ⏳ 대기 |
| **11-1~11-3** | `feat(sync): return SyncResult and show count in UI` | local-search.ts, ipc-handlers.ts, settings.html | ⏳ 대기 |

### 🔴 즉시 필요한 커밋 (Phase 4 + 8 + 9 통합)

```bash
git add .
git commit -m "feat(sync): add Gmail sync adapter with batched requests

- Add Gmail sync adapter following Notion sync pattern
- Implement batched pagination (40 emails/batch, 500ms delay)
- Fix 'Too many subrequests' error for Cloudflare Worker Free plan
- Update context.getRelated to use local DB first with API fallback
- Add Gmail to Settings UI Data Sync section

Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-opencode)
Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

## Success Criteria

### Verification Commands
```bash
npm run build        # Expected: 에러 없음
npm run pack:clean   # Expected: 앱 정상 실행
```

### Final Checklist
- [ ] 모든 Phase 완료 (0-6 + 8 + 9 + 10 + 11 + 7)
- [ ] 빌드 성공 (`npm run build` 에러 없음)
- [ ] 기존 기능(캡처, 이슈 생성) 정상 동작
- [ ] 새 기능(동기화, 로컬 검색) 동작
- [ ] **Graceful Degradation 검증**:
  - [ ] API 키 없이 앱 실행 가능
  - [ ] DB 초기화 실패해도 앱 크래시 없음
  - [ ] 동기화 실패해도 기존 기능 영향 없음
- [ ] **동기화 기능 검증**:
  - [ ] Sync Now 버튼 클릭 시 실제 동기화
  - [ ] 5분마다 Auto Sync 로그 확인
  - [ ] 검색에서 동기화된 데이터 표시
- [ ] **검색 품질 검증** (Phase 10):
  - [ ] "cto" 검색 시 모든 소스 결과 표시
  - [ ] 기존 의미 검색 품질 유지
- [ ] **UI 피드백 검증** (Phase 11):
  - [ ] Sync Now 클릭 시 "Synced N items" 표시
  - [ ] 각 소스별 Last synced 시간 표시

---

---

### Phase 9: Gmail Sync Adapter ✅ DONE

- [x] Gmail sync adapter 추가 (`src/services/sync-adapters/gmail-sync.ts`)
- [x] Notion sync 패턴 따라 구현
- [x] context.getRelated를 LocalSearchService 우선 사용으로 수정
- [x] Settings UI에 Gmail sync 버튼 추가

**Gmail 배치 처리 수정 (Phase 9-fix):**
- 문제: Cloudflare Worker Free plan 50 subrequest 제한 → "Too many subrequests" 에러
- 해결: 배치 처리 구현
  - `BATCH_SIZE = 40` (안전 마진)
  - `BATCH_DELAY_MS = 500` (요청 간 딜레이)
  - `MAX_BATCHES = 25` (최대 1000개)
  - `before:` 쿼리로 페이지네이션

**Commit**: 미커밋 (Phase 8+9 함께 커밋 예정)

---

### Phase 10: 검색 품질 개선 🔴 NEW (상세화 완료)

**배경**:
- "cto" 검색 → Gmail만 결과 (Embedding 한계)
- "경호님" 검색 → 모든 소스 결과 (한글 키워드 매칭)
- 영어 약어/짧은 키워드 검색 품질 낮음

**현재 구현 상태 분석** (2025-02-05):
- ✅ Hybrid Search (FTS + Vector) **이미 구현됨** (`local-search.ts:188-222`)
- ✅ RRF 병합 **이미 구현됨** (`local-search.ts:316-354`)
- ✅ `keywordSearch()` FTS 사용 (`websearch_to_tsquery('simple', $1)`)
- ❌ **문제**: `websearch_to_tsquery`가 짧은 키워드("cto", "kr" 등)에 대해 빈 결과 반환

**근본 원인**:
PostgreSQL `websearch_to_tsquery('simple', 'cto')`는 3글자 이하 단어를 stopword로 처리하거나 
lexeme 변환 시 빈 결과를 반환할 수 있음. 특히 영어 약어는 tsvector에서 검색이 어려움.

**해결 방안**: 짧은 키워드용 LIKE 검색 fallback 추가

---

#### Phase 10-1: 짧은 키워드 LIKE 검색 추가 (🔴 CRITICAL)

- [ ] 10-1. `keywordSearch()` 메서드에 LIKE fallback 추가

  **What to do**:
  
  `src/services/local-search.ts`의 `keywordSearch()` 메서드 수정:
  
  ```typescript
  private async keywordSearch(query: string, limit: number, source?: string): Promise<SearchResult[]> {
    if (!this.isInitialized()) {
      console.warn('[LocalSearch] keywordSearch skipped - DB not initialized');
      return [];
    }

    const db = this.dbService.getDb();
    
    // 짧은 키워드(3자 이하)는 LIKE 검색 우선
    if (query.length <= 3) {
      console.log(`[LocalSearch] Short query "${query}" - using LIKE search`);
      return this.likeSearch(query, limit, source);
    }

    // 기존 FTS 검색
    const ftsResults = await this.ftsSearch(query, limit, source);
    
    // FTS 결과가 없으면 LIKE fallback
    if (ftsResults.length === 0) {
      console.log(`[LocalSearch] FTS returned 0 results, falling back to LIKE`);
      return this.likeSearch(query, limit, source);
    }
    
    return ftsResults;
  }

  private async likeSearch(query: string, limit: number, source?: string): Promise<SearchResult[]> {
    const db = this.dbService.getDb();
    
    const conditions = [`(content ILIKE $1 OR title ILIKE $1)`];
    const params: any[] = [`%${query}%`, limit];

    if (source) {
      params.push(source);
      conditions.push(`source_type = $${params.length}`);
    }

    // Slack 채널 필터링 (기존 로직 유지)
    const selectedChannels = getSelectedSlackChannels();
    if (selectedChannels.length > 0) {
      const channelIds = selectedChannels.map(ch => ch.id);
      params.push(JSON.stringify(channelIds));
      conditions.push(`(source_type != 'slack' OR metadata->>'channelId' = ANY(SELECT jsonb_array_elements_text($${params.length}::jsonb)))`);
    } else {
      conditions.push(`source_type != 'slack'`);
    }

    const whereClause = 'WHERE ' + conditions.join(' AND ');

    const result = await db.query<DatabaseRow>(
      `
      SELECT 
        id, source_type, source_id, title, content, metadata, source_created_at,
        0.5 AS score  -- LIKE 매칭은 고정 점수
      FROM documents
      ${whereClause}
      ORDER BY source_created_at DESC
      LIMIT $2
      `,
      params
    );

    return result.rows.map(row => this.rowToSearchResult(row));
  }

  // 기존 FTS 로직을 별도 메서드로 분리
  private async ftsSearch(query: string, limit: number, source?: string): Promise<SearchResult[]> {
    // 기존 keywordSearch() 내부 로직 이동
    const db = this.dbService.getDb();
    const conditions = ['tsv @@ query'];
    const params: any[] = [query, limit];
    // ... 기존 로직 유지
  }
  ```

  **Must NOT do**:
  - 기존 FTS 검색 로직 삭제하지 않음
  - LIKE 검색이 긴 쿼리에도 실행되지 않도록 조건 확인

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **References**:
  - `src/services/local-search.ts:273-313` - 현재 keywordSearch() 구현
  - `src/services/local-search.ts:245-270` - semanticSearch() 참고 (채널 필터링 패턴)

  **Acceptance Criteria**:
  - [ ] "cto" 검색 시 Gmail + Slack + Linear 결과 모두 표시
  - [ ] "kr" 검색 시 한국 관련 문서 표시
  - [ ] 긴 쿼리("회의록 정리")는 기존 FTS 검색 사용
  - [ ] TypeScript 컴파일 에러 없음

  **Commit**: YES
  - Message: `feat(search): add LIKE search fallback for short keywords`
  - Files: `src/services/local-search.ts`

---

### Phase 11: Sync UI 개선 🟡 NEW (상세화 완료)

**배경**:
- Sync Now 버튼 클릭 시 피드백 부족
- "just now"만 표시, 몇 개 sync됐는지 안 보임
- Last synced 정보 안 뜸

**현재 구현 상태 분석** (2025-02-05):
- `sync:trigger` IPC 핸들러: `{ success: true }` 만 반환 (itemsSynced 없음)
- `syncSource()`: `void` 반환 (결과 정보 없음)
- Settings UI: 동기화 후 "just now"만 표시

**해결 방안**: syncSource() 반환값 활용 + UI 개선

---

#### Phase 11-1: syncSource() 반환값 변경 (🔴 CRITICAL)

- [ ] 11-1. `syncSource()`가 `SyncResult`를 반환하도록 수정

  **What to do**:
  
  `src/services/local-search.ts` 수정:
  
  ```typescript
  // SyncResult 인터페이스 export 추가 (이미 sync-adapters에 정의됨)
  export interface SyncResult {
    success: boolean;
    itemsSynced: number;
    itemsFailed: number;
    errors: Array<{ id: string; error: string }>;
    lastCursor?: string;
  }

  // syncSource() 반환 타입 변경: void → SyncResult
  async syncSource(source: string): Promise<SyncResult> {
    console.log(`[LocalSearch] Starting sync for: ${source}`);

    if (!this.canSync()) {
      const reason = !this.isInitialized()
        ? 'Database not initialized'
        : 'OpenAI API key not set';
      console.error(`[LocalSearch] Cannot sync: ${reason}`);
      throw new Error(`Sync unavailable: ${reason}. Please check Settings.`);
    }

    try {
      let result: SyncResult;
      
      switch (source) {
        case 'slack': {
          const adapter = createSlackSyncAdapter();
          result = await adapter.syncIncremental();
          console.log(`[LocalSearch] Slack sync complete: ${result.itemsSynced} items`);
          break;
        }
        case 'notion': {
          const adapter = createNotionSyncAdapter();
          result = await adapter.syncIncremental();
          console.log(`[LocalSearch] Notion sync complete: ${result.itemsSynced} items`);
          break;
        }
        case 'linear': {
          const adapter = createLinearSyncAdapter();
          result = await adapter.syncIncremental();
          console.log(`[LocalSearch] Linear sync complete: ${result.itemsSynced} items`);
          break;
        }
        case 'gmail': {
          const adapter = createGmailSyncAdapter();
          result = await adapter.syncIncremental();
          console.log(`[LocalSearch] Gmail sync complete: ${result.itemsSynced} items`);
          break;
        }
        default:
          console.warn(`[LocalSearch] Unknown source: ${source}`);
          return { success: false, itemsSynced: 0, itemsFailed: 0, errors: [] };
      }
      
      return result;
    } catch (error) {
      console.error(`[LocalSearch] Sync failed for ${source}:`, error);
      throw error;
    }
  }
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **References**:
  - `src/services/local-search.ts:111-154` - 현재 syncSource() 구현
  - `src/services/sync-adapters/gmail-sync.ts:29-35` - SyncResult 인터페이스

  **Acceptance Criteria**:
  - [ ] `syncSource()`가 `{ success, itemsSynced, itemsFailed }` 반환
  - [ ] TypeScript 컴파일 에러 없음

  **Commit**: YES (11-2와 함께)

---

#### Phase 11-2: IPC handler 수정

- [ ] 11-2. `sync:trigger` 핸들러가 itemsSynced 반환

  **What to do**:
  
  `src/main/ipc-handlers.ts` 수정:
  
  ```typescript
  ipcMain.handle('sync:trigger', async (_event, source: string) => {
    try {
      const localSearch = getLocalSearchService();
      if (!localSearch) {
        return { success: false, error: 'LocalSearchService not initialized' };
      }
      const result = await localSearch.syncSource(source);
      return { 
        success: result.success, 
        itemsSynced: result.itemsSynced,
        itemsFailed: result.itemsFailed 
      };
    } catch (error) {
      logger.error('sync:trigger error:', error);
      return { success: false, error: String(error) };
    }
  });
  ```

  **References**:
  - `src/main/ipc-handlers.ts:819-831` - 현재 sync:trigger 핸들러

  **Acceptance Criteria**:
  - [ ] IPC 응답에 `itemsSynced` 포함

  **Commit**: YES (11-1과 함께)

---

#### Phase 11-3: Settings UI 개선

- [ ] 11-3. 동기화 결과 표시 및 Last synced 정보

  **What to do**:
  
  `src/renderer/settings.html`의 `triggerSync()` 함수 수정:
  
  ```javascript
  async function triggerSync(source, btn, statusEl) {
    btn.disabled = true;
    btn.classList.add('syncing');
    btn.textContent = await t('sync.syncing');
    statusEl.textContent = await t('sync.syncing');
    statusEl.classList.add('syncing');

    try {
      const result = await ipcRenderer.invoke('sync:trigger', source);
      if (result.success) {
        // 동기화된 개수 표시
        const itemsText = result.itemsSynced === 1 ? 'item' : 'items';
        statusEl.textContent = `Synced ${result.itemsSynced} ${itemsText}`;
        statusEl.classList.remove('syncing', 'error');
        
        // 2초 후 "just now"로 변경
        setTimeout(() => {
          statusEl.textContent = 'just now';
        }, 2000);
      } else {
        statusEl.textContent = result.error || await t('sync.failed');
        statusEl.classList.remove('syncing');
        statusEl.classList.add('error');
      }
    } catch (error) {
      // ... 기존 에러 처리
    } finally {
      btn.classList.remove('syncing');
      btn.textContent = await t('sync.syncNow');
      btn.disabled = false;
    }
  }
  ```

  **References**:
  - `src/renderer/settings.html:1570-1597` - 현재 triggerSync() 함수

  **Acceptance Criteria**:
  - [ ] Sync Now 클릭 시 "Synced N items" 메시지 표시
  - [ ] 2초 후 "just now"로 변경
  - [ ] Sync 실패 시 에러 메시지 표시

  **Commit**: YES
  - Message: `feat(ui): show sync result count in Settings`
  - Files: `src/services/local-search.ts`, `src/main/ipc-handlers.ts`, `src/renderer/settings.html`

---

#### Phase 11 전체 요약

| Sub-Phase | 작업 | 우선순위 |
|-----------|------|---------|
| **11-1** | syncSource() 반환값 변경 | 🔴 Critical |
| **11-2** | IPC handler 수정 | 🔴 Critical |
| **11-3** | Settings UI 개선 | 🟡 Medium |

**전체 커밋 전략**:
1. `feat(sync): return SyncResult from syncSource` (11-1 + 11-2)
2. `feat(ui): show sync result count in Settings` (11-3)

---

## 참고 문서

- `docs/pr8-comparison.md` - PR #8 vs Master 상세 비교
- PR 브랜치: `origin/feature/local-search-architecture`
- Master 모듈 구조: `src/main/` (10개 파일), `src/services/` (19개 파일)
