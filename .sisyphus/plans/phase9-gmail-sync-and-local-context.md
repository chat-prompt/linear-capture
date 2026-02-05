# Phase 9: Gmail Sync + context.getRelated 로컬 전환

## TL;DR

> **목표**: Gmail sync adapter 추가 + context.getRelated를 전체 로컬 DB 검색으로 전환
> 
> **작업 범위**:
> - `gmail-sync.ts` 생성 (~350줄)
> - `local-search.ts`에 Gmail 추가
> - `context.getRelated` 핸들러를 LocalSearchService로 전환
> 
> **예상 시간**: 1-2시간

---

## 배경

### 현재 상태
- Phase 8 완료: DB 초기화, graceful degradation, syncSource(), Auto Sync 스케줄러
- `context.getRelated`: 실시간 API 호출 (Slack/Notion/Gmail/Linear 각각)
- Gmail sync adapter: **없음**

### 목표 상태
- 4개 소스 모두 로컬 DB에서 검색
- Gmail sync adapter 추가
- `context.getRelated`가 LocalSearchService 사용

### Adapter 구분 (참고)

| Adapter 종류 | 위치 | 용도 |
|-------------|------|------|
| `context-adapters/gmail-adapter.ts` | 기존 | 실시간 API 검색 (getRelated fallback용) |
| `sync-adapters/gmail-sync.ts` | **신규** | 로컬 DB 동기화 (incremental sync) |

> **Note**: context-adapter는 실시간 API 호출용이고, sync-adapter는 로컬 DB에 데이터를 동기화하는 용도입니다. 둘은 별개로 존재합니다.

---

## TODOs

### Phase 9-1: Gmail Sync Adapter 생성 (🔴 Critical)

**파일**: `src/services/sync-adapters/gmail-sync.ts`

**참고 파일**: `src/services/sync-adapters/notion-sync.ts` (패턴 동일)

**구현 내용**:
```typescript
import * as crypto from 'crypto';
import { getDatabaseService } from '../database';
import { createGmailService } from '../gmail-client';
import { createTextPreprocessor } from '../text-preprocessor';
import { createEmbeddingService } from '../embedding-service';
import type { GmailService, GmailMessage } from '../gmail-client';
import type { DatabaseService } from '../database';
import type { TextPreprocessor } from '../text-preprocessor';
import type { EmbeddingService } from '../embedding-service';

export interface SyncResult {
  success: boolean;
  itemsSynced: number;
  itemsFailed: number;
  errors: Array<{ emailId: string; error: string }>;
  lastCursor?: string;
}

export class GmailSyncAdapter {
  private gmailService: GmailService;
  private dbService: DatabaseService;
  private preprocessor: TextPreprocessor;
  private embeddingService: EmbeddingService;

  constructor() {
    this.gmailService = createGmailService();
    this.dbService = getDatabaseService();
    this.preprocessor = createTextPreprocessor();
    this.embeddingService = createEmbeddingService();
  }

  async sync(): Promise<SyncResult> {
    // Full sync - 최근 1000개 이메일
    // gmail-client.ts의 searchEmails(query, limit) 사용
  }

  async syncIncremental(): Promise<SyncResult> {
    // Incremental sync - lastCursor 이후 이메일만
    // 
    // Gmail date 형식 변환 (중요):
    // - GmailMessage.date: ISO string (예: "2025-02-04T12:00:00Z")
    // - Gmail API after: 쿼리: "after:2025/02/04" 형식 필요
    // 
    // 변환 로직:
    // const lastSyncDate = new Date(lastCursor);
    // const afterDate = lastSyncDate.toISOString().split('T')[0].replace(/-/g, '/');
    // const query = `after:${afterDate}`;  // → "after:2025/02/04"
    // 
    // searchEmails(query, 100) 사용
  }

  private async syncEmail(email: GmailMessage): Promise<void> {
    // 1. fullText = subject + "\n\n" + snippet
    // 2. preprocessedText = preprocessor.preprocess(fullText)
    // 3. contentHash = calculateContentHash(preprocessedText)
    // 4. 기존 문서 확인 (content_hash 비교)
    // 5. embedding = embeddingService.embed(preprocessedText)
    // 6. DB에 INSERT ... ON CONFLICT UPDATE
  }

  // updateSyncStatus, updateSyncCursor, calculateContentHash 등
}

export function createGmailSyncAdapter(): GmailSyncAdapter {
  return new GmailSyncAdapter();
}
```

**Acceptance Criteria**:
- [ ] `createGmailSyncAdapter()` export
- [ ] `sync()` / `syncIncremental()` 메서드 구현
- [ ] `syncIncremental()`에서 Gmail `after:YYYY/MM/DD` 쿼리 형식 사용
- [ ] documents 테이블에 source_type='gmail'로 저장
- [ ] content_hash로 중복 방지
- [ ] metadata에 `from`, `fromName`, `threadId` 포함

---

### Phase 9-2: local-search.ts에 Gmail 추가 (🔴 Critical)

**파일**: `src/services/local-search.ts`

**수정 내용**:

1. **Import 추가** (line 17-19):
```typescript
import { createGmailSyncAdapter } from './sync-adapters/gmail-sync';
```

2. **DatabaseRow 인터페이스 수정** (line 24-33) - ⚠️ 필수:
```typescript
interface DatabaseRow {
  id: string;
  source_type: 'notion' | 'slack' | 'linear' | 'gmail';  // 'gmail' 추가!
  source_id: string;
  title?: string;
  content: string;
  metadata?: Record<string, any>;
  source_created_at?: Date;
  score: number;
}
```

3. **SyncStatus 인터페이스 수정** (line 35-40):
```typescript
export interface SyncStatus {
  initialized: boolean;
  slack?: { lastSync?: number; documentCount?: number };
  notion?: { lastSync?: number; documentCount?: number };
  linear?: { lastSync?: number; documentCount?: number };
  gmail?: { lastSync?: number; documentCount?: number };  // 추가
}
```

4. **syncSource() switch문에 gmail case 추가** (line 121 부근):
```typescript
case 'gmail': {
  const adapter = createGmailSyncAdapter();
  const result = await adapter.syncIncremental();
  console.log(`[LocalSearch] Gmail sync complete: ${result.itemsSynced} items, ${result.itemsFailed} failed`);
  break;
}
```

5. **syncAll()에 gmail 추가** (line 157):
```typescript
const sources = ['slack', 'notion', 'linear', 'gmail'];
```

**Acceptance Criteria**:
- [ ] `DatabaseRow.source_type`에 `'gmail'` 포함
- [ ] `SyncStatus`에 `gmail` 필드 추가
- [ ] `syncSource('gmail')` 호출 시 GmailSyncAdapter 실행
- [ ] `syncAll()` 시 gmail도 포함

---

### Phase 9-3: context.getRelated 로컬 전환 (🔴 Critical)

**파일**: `src/main/ipc-handlers.ts`

**현재 코드** (line 617-729): 각 서비스 API 직접 호출

**수정 방향**:
```typescript
ipcMain.handle('context.getRelated', async (_event, { query, limit = 20 }) => {
  const debug: string[] = [];
  debug.push(`query="${query}", limit=${limit}`);
  
  if (!query || query.length < 3) {
    return { success: true, results: [], _debug: [...debug, 'query too short'] };
  }
  
  try {
    const QUOTA_PER_SOURCE = 5;
    const results: any[] = [];
    
    const localSearch = getLocalSearchService();
    const useLocalSearch = localSearch?.isInitialized() ?? false;
    debug.push(`localSearch: ${useLocalSearch ? 'available' : 'unavailable'}`);

    if (useLocalSearch) {
      // 로컬 DB에서 검색 (전체 소스)
      const localResults = await localSearch!.search(query, [], QUOTA_PER_SOURCE * 4);
      
      // source별 그룹핑
      const slackResults = localResults.filter(r => r.source === 'slack').slice(0, QUOTA_PER_SOURCE);
      const notionResults = localResults.filter(r => r.source === 'notion').slice(0, QUOTA_PER_SOURCE);
      const linearResults = localResults.filter(r => r.source === 'linear').slice(0, QUOTA_PER_SOURCE);
      const gmailResults = localResults.filter(r => r.source === 'gmail').slice(0, QUOTA_PER_SOURCE);
      
      debug.push(`slack: ${slackResults.length} (local)`);
      debug.push(`notion: ${notionResults.length} (local)`);
      debug.push(`linear: ${linearResults.length} (local)`);
      debug.push(`gmail: ${gmailResults.length} (local)`);
      
      // 결과 매핑
      results.push(...slackResults.map(r => ({
        id: `slack-${r.id}`,
        source: 'slack',
        title: r.title || '',
        snippet: r.content?.substring(0, 200) || '',
        url: r.url,
        timestamp: r.timestamp,
      })));
      
      // notion, linear, gmail도 동일 패턴...
      
    } else {
      // Fallback: 기존 API 호출 로직 유지
      debug.push('using API fallback');
      // ... 기존 코드
    }
    
    // 정렬 및 중복 제거
    const sorted = results.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    debug.push(`total: ${sorted.length}`);
    
    return { success: true, results: sorted.slice(0, limit), _debug: debug };
  } catch (error) {
    debug.push(`ERROR: ${String(error)}`);
    return { success: false, error: String(error), results: [], _debug: debug };
  }
});
```

**Acceptance Criteria**:
- [ ] LocalSearchService 사용 시 `_debug`에 `(local)` 표시
- [ ] API fallback 시 `_debug`에 `(api)` 또는 `API fallback` 표시
- [ ] 4개 소스 모두 결과 반환

---

### Phase 9-4: 빌드 및 테스트 (🟡 Medium)

**명령어**:
```bash
npm run build
npm run pack:clean
```

**테스트 항목**:
- [ ] 앱 시작 시 DB 초기화 로그
- [ ] Settings > Data Sync > Gmail Sync Now 버튼
- [ ] Related Context 검색 시 `_debug` 확인 (`(local)` 표시)
- [ ] 4개 소스 모두 검색 결과 표시

---

## Execution Order

```
Phase 9-1: gmail-sync.ts 생성
    ↓
Phase 9-2: local-search.ts 수정 (Gmail 추가)
    ↓
Phase 9-3: context.getRelated 로컬 전환
    ↓
Phase 9-4: 빌드 및 테스트
```

---

## Commit Strategy

| Phase | Commit Message | Files |
|-------|----------------|-------|
| 9-1 | `feat(sync): add Gmail sync adapter` | `gmail-sync.ts` |
| 9-2 | `feat(sync): integrate Gmail in LocalSearchService` | `local-search.ts` |
| 9-3 | `refactor(context): use LocalSearchService for getRelated` | `ipc-handlers.ts` |

또는 하나로 합쳐서:
- `feat(sync): add Gmail sync and switch context.getRelated to local DB`

---

## 참고 파일

| 파일 | 용도 |
|------|------|
| `src/services/sync-adapters/notion-sync.ts` | Gmail sync adapter 템플릿 |
| `src/services/gmail-client.ts` | Gmail 서비스 (`searchEmails`, `GmailMessage` 타입) |
| `src/services/context-adapters/gmail-adapter.ts` | 기존 Gmail adapter (API 검색용, 참고) |
| `src/main/ipc-handlers.ts` | `context.getRelated` 핸들러 |
| `src/services/local-search.ts` | LocalSearchService |
| `src/types/context-search.ts` | `ContextSource` 타입 (이미 'gmail' 포함)
