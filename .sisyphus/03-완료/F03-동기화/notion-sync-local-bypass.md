# Notion Sync - Local Reader Bypass

## TL;DR

> **Quick Summary**: Notion sync가 여전히 6개만 동기화하는 이유 - 로컬 리더가 페이지네이션을 지원하지 않아 API 호출을 우회함.
> 
> **Root Cause**: `isNotionDbAvailable()` = true일 때 `NotionLocalReader.searchPages()`가 사용되는데, 이 메서드는 `hasMore`/`nextCursor`를 반환하지 않음 → 페이지네이션 루프 즉시 종료
> 
> **Fix**: Sync 시에는 로컬 리더를 우회하고 API만 사용하도록 수정
> 
> **Estimated Effort**: Small (1-2시간)
> **Critical Path**: 단일 파일 수정

---

## Problem Analysis

### 증상
- Gmail: 901개 ✅
- Linear: 390개 ✅
- Slack: 2320개 ✅
- **Notion: 6개** ❌ (21k+ 페이지 중)

### 코드 흐름 추적

```
NotionSyncAdapter.sync()
  └── while (hasMore) {
        const searchResult = await this.notionService.searchPages('', 100, cursor);
        └── NotionService.searchPages(query, pageSize, cursor)
              └── if (isNotionDbAvailable()) {           // ← TRUE (Notion 앱 설치됨)
                    const localResult = await localReader.searchPages(query, limit);
                    if (localResult.pages.length > 0) {
                      return { ...localResult, source: 'local' };  // ← hasMore 없음!
                    }
                  }
        
        hasMore = searchResult.hasMore ?? false;  // ← undefined ?? false = FALSE
        // 루프 즉시 종료!
      }
```

### 근본 원인

| 컴포넌트 | 문제 |
|---------|------|
| `NotionLocalReader.searchPages()` | `hasMore`, `nextCursor` 반환하지 않음 |
| `NotionService.searchPages()` | 로컬 결과 있으면 cursor 파라미터 무시하고 반환 |
| `NotionSyncAdapter.sync()` | `hasMore ?? false` → 항상 false |

### 왜 로컬 리더가 사용되는가?

```typescript
// notion-client.ts:171
if (isNotionDbAvailable()) {  // Notion Desktop 앱이 설치되어 있으면 true
  const localReader = getNotionLocalReader();
  const localResult = await localReader.searchPages(query, limit);
  
  if (localResult.success && localResult.pages.length > 0) {
    return { ...localResult, source: 'local' };  // API 호출 안 함!
  }
}
```

**의도**: 로컬 캐시로 빠른 검색 지원 (UI용)
**부작용**: Sync에서도 로컬 리더 사용 → 페이지네이션 불가

---

## Solution Options

### Option A: Sync용 별도 메서드 (권장) ⭐

**변경**: `NotionService`에 `searchPagesForSync()` 메서드 추가 - 항상 API 사용

```typescript
// notion-client.ts
async searchPagesForSync(pageSize: number, cursor?: string): Promise<NotionSearchResult> {
  // 로컬 리더 우회, 항상 API 호출
  return this.searchPagesViaApi('', pageSize, cursor);
}
```

**장점**:
- 기존 `searchPages()` 로직 변경 없음 (UI 검색 영향 없음)
- 명확한 의도 표현
- 테스트 용이

**단점**:
- 새 메서드 추가

### Option B: searchPages에 forceApi 파라미터 추가

```typescript
async searchPages(query: string, pageSize?: number, cursor?: string, forceApi = false)
```

**장점**: 기존 메서드 활용
**단점**: 파라미터 복잡해짐, 기존 호출부 영향

### Option C: Sync에서 직접 API 호출

```typescript
// notion-sync.ts
const searchResult = await this.notionService['searchPagesViaApi']('', 100, cursor);
```

**장점**: NotionService 수정 불필요
**단점**: private 메서드 접근 (캡슐화 위반)

---

## Selected Solution: Option A

### 변경 파일

1. `src/services/notion-client.ts` - `searchPagesForSync()` 메서드 추가
2. `src/services/sync-adapters/notion-sync.ts` - `searchPagesForSync()` 호출로 변경
3. `src/services/sync-adapters/__tests__/notion-sync.test.ts` - mock 업데이트

### 구현 계획

#### Step 1: NotionService에 메서드 추가

```typescript
// notion-client.ts

/**
 * Search pages for sync - always uses API (bypasses local reader)
 * Local reader doesn't support pagination, so sync must use API
 */
async searchPagesForSync(pageSize: number = 100, cursor?: string): Promise<NotionSearchResult> {
  return this.searchPagesViaApi('', pageSize, cursor);
}
```

#### Step 2: NotionSyncAdapter에서 사용

```typescript
// notion-sync.ts

// Before:
const searchResult = await this.notionService.searchPages('', 100, cursor);

// After:
const searchResult = await this.notionService.searchPagesForSync(100, cursor);
```

#### Step 3: 테스트 mock 업데이트

```typescript
// notion-sync.test.ts

vi.mock('../../notion-client', () => ({
  createNotionService: () => ({
    searchPages: mockSearchPages,
    searchPagesForSync: mockSearchPages,  // 추가
    getPageContent: mockGetPageContent,
  }),
}));
```

---

## Verification

### 테스트 실행
```bash
npm test src/services/sync-adapters/__tests__/notion-sync.test.ts
```

### 수동 테스트
```javascript
// 콘솔에서 실행
window.ipcRenderer.invoke('sync:trigger', 'notion').then(console.log)

// 예상 출력:
// { success: true, itemsSynced: 21000+, itemsFailed: 0 }
```

### 로그 확인
```
[NotionSync] Starting full sync
[NotionSync] Found 100 pages (cursor: none)
[NotionSync] Found 100 pages (cursor: abc123...)
[NotionSync] Found 100 pages (cursor: def456...)
... (반복)
[NotionSync] Full sync complete: 21000 synced, 0 failed
```

---

## TODOs

- [ ] 1. `NotionService.searchPagesForSync()` 메서드 추가
- [ ] 2. `NotionSyncAdapter.sync()` - `searchPagesForSync()` 호출로 변경
- [ ] 3. `NotionSyncAdapter.syncIncremental()` - 동일하게 변경
- [ ] 4. 테스트 mock 업데이트
- [ ] 5. 테스트 실행 및 검증
- [ ] 6. 수동 테스트 (실제 Notion 동기화)

---

## Risk Assessment

| 리스크 | 영향 | 대응 |
|-------|------|------|
| API Rate Limit | 21k 페이지 요청 시 제한 걸릴 수 있음 | 이미 구현된 에러 핸들링 + resume 기능으로 대응 |
| 긴 동기화 시간 | 21k 페이지 = 210+ API 호출 | 진행률 로그로 모니터링 |
| 기존 검색 기능 영향 | 없음 | `searchPages()`는 변경 없음 |

---

## Why Local Reader Can't Be Used for Sync

1. **불완전한 데이터**: 로컬 캐시는 Notion 앱에서 열어본 페이지만 포함
2. **페이지네이션 미지원**: SQL 쿼리로 모든 페이지 한 번에 가져오는 구조
3. **API 전용 필드**: `hasMore`, `nextCursor`는 Notion API 응답에만 존재
4. **동기화 목적 부적합**: 검색 UI용으로 설계됨, Full Sync용 아님
