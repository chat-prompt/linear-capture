# Linear 검색 개선 v2 - 근본적 해결

## TL;DR

> **문제**: "cto" 검색 시 Linear 이슈가 안 나옴
> **근본 원인**: Incremental sync가 기존 데이터를 업데이트하지 않음
> **해결**: Force re-sync 기능 추가
> 
> **수정 파일 (4개)**:
> - `src/services/sync-adapters/linear-sync.ts` - syncFull() 메서드 추가
> - `src/services/local-search.ts` - syncSource()에 force 옵션 추가
> - `src/main/ipc-handlers.ts` - sync:trigger 핸들러에 force 옵션 전달
> - `src/renderer/settings.html` - Force Re-sync 버튼 추가

## 문제 분석

### 현재 동작 흐름

```
1. 사용자가 "cto" 입력 (3글자)
2. keywordSearch() → query.length <= 3 → likeSearch() 호출
3. likeSearch()에서 metadata->>'assigneeName' ILIKE '%cto%' 검색
4. 하지만 기존 데이터에 assigneeName이 없음 → 결과 0건
```

### 왜 기존 데이터에 assigneeName이 없는가?

1. **이전 코드**에서는 metadata에 `assigneeName` 저장 안 함
2. **새 코드**에서는 저장하지만, **이미 동기화된 이슈는 다시 가져오지 않음**
3. `syncIncremental()`의 필터: `{ updatedAt: { gt: new Date(lastCursor) } }`
4. Linear에서 수정 안 된 이슈 → 다시 fetch 안 함 → metadata 업데이트 불가

### 검색 경로별 한계

| 검색 경로 | 검색 대상 | metadata 검색 |
|-----------|-----------|---------------|
| **Semantic** | embedding 유사도 | ❌ 불가 |
| **FTS (tsvector)** | title + content | ❌ 불가 (스키마 한계) |
| **LIKE fallback** | title + content + metadata | ✅ 가능 (새 데이터만) |

---

## 해결 방안 (3가지 옵션)

### Option A: Force Full Re-sync 기능 추가 (권장)

**장점**: 기존 데이터 완전 업데이트, 가장 확실한 해결
**단점**: 사용자가 수동으로 실행해야 함

**구현 내용**:
1. Settings UI에 "Force Re-sync" 버튼 추가
2. Linear sync adapter에 `syncFull(force: boolean)` 파라미터 추가
3. force=true 시 기존 데이터 삭제 후 전체 re-sync

### Option B: tsv (Full-Text Search)에 metadata 포함

**장점**: FTS 성능 유지하면서 metadata 검색 가능
**단점**: DB 마이그레이션 필요, 복잡

**구현 내용**:
1. tsv 컬럼 정의 변경:
   ```sql
   tsv tsvector GENERATED ALWAYS AS (
     setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
     setweight(to_tsvector('simple', content), 'B') ||
     setweight(to_tsvector('simple', coalesce(metadata->>'assigneeName', '')), 'C') ||
     setweight(to_tsvector('simple', coalesce(metadata->>'projectName', '')), 'C')
   ) STORED
   ```
2. 스키마 버전 업그레이드 (migration 2)

### Option C: content에 metadata 텍스트 포함 (이미 구현됨)

**장점**: 코드 수정 완료, 추가 작업 최소
**단점**: re-sync 필요

**현재 상태**:
- `linear-sync.ts`에서 content에 `담당자: ${assigneeName}` 포함하도록 수정됨
- 하지만 기존 데이터는 업데이트 안 됨

---

## 추천 구현 계획

### Phase 1: Force Re-sync 기능 (필수)

> **호출 체인**: IPC → LocalSearchService → LinearSyncAdapter
> 
> ```
> sync:trigger (ipc-handlers.ts)
>     ↓
> LocalSearchService.syncSource(source, force)  (local-search.ts)
>     ↓
> LinearSyncAdapter.syncFull(true) or syncIncremental()  (linear-sync.ts)
> ```

#### 1-1. LinearSyncAdapter에 syncFull 메서드 추가

**파일**: `src/services/sync-adapters/linear-sync.ts`

**위치**: `syncIncremental()` 메서드 다음 (Line 207 이후)

**추가 내용**:
```typescript
/**
 * Full sync with option to clear existing data
 * @param clearExisting - If true, deletes all existing Linear data before sync
 */
async syncFull(clearExisting = false): Promise<SyncResult> {
  if (clearExisting) {
    console.log('[LinearSync] Force re-sync: clearing existing data...');
    const db = this.dbService.getDb();
    await db.query(`DELETE FROM documents WHERE source_type = 'linear'`);
    await db.query(`DELETE FROM sync_cursors WHERE source_type = 'linear'`);
    console.log('[LinearSync] Force re-sync: existing data cleared');
  }
  
  return this.sync();
}
```

#### 1-2. LocalSearchService에 force 옵션 추가

**파일**: `src/services/local-search.ts`

**변경 위치**: `syncSource()` 메서드 시그니처 및 linear case (Line 119, 156-166)

**변경 내용**:
```typescript
// Line 119: 메서드 시그니처 변경
async syncSource(source: string, force = false): Promise<SyncResult> {
  console.log(`[LocalSearch] Starting sync for: ${source}${force ? ' (force)' : ''}`);
  // ... 기존 코드 ...

  // Line 156-166: linear case 변경
  case 'linear': {
    const adapter = createLinearSyncAdapter();
    const adapterResult = force
      ? await adapter.syncFull(true)      // force=true → 기존 데이터 삭제 후 전체 sync
      : await adapter.syncIncremental();  // force=false → 기존 incremental sync
    console.log(`[LocalSearch] Linear sync complete: ${adapterResult.itemsSynced} items, ${adapterResult.itemsFailed} failed`);
    return {
      success: adapterResult.success,
      itemsSynced: adapterResult.itemsSynced,
      itemsFailed: adapterResult.itemsFailed,
      errors: adapterResult.errors.map(e => ({ id: e.itemId, error: e.error })),
      lastCursor: adapterResult.lastCursor,
    };
  }
```

#### 1-3. IPC 핸들러에 force 옵션 전달

**파일**: `src/main/ipc-handlers.ts`

**변경 위치**: `sync:trigger` 핸들러 (Line 819-835)

**변경 내용**:
```typescript
// 기존: ipcMain.handle('sync:trigger', async (_event, source: string) => {
// 변경: 파라미터가 string 또는 { source, force } 객체 허용
ipcMain.handle('sync:trigger', async (
  _event, 
  sourceOrOptions: string | { source: string; force?: boolean }
) => {
  try {
    // 하위 호환성: string이면 기존 방식, 객체면 새 방식
    const source = typeof sourceOrOptions === 'string' 
      ? sourceOrOptions 
      : sourceOrOptions.source;
    const force = typeof sourceOrOptions === 'object' 
      ? sourceOrOptions.force ?? false 
      : false;

    const localSearch = getLocalSearchService();
    if (!localSearch) {
      return { success: false, error: 'LocalSearchService not initialized' };
    }
    const result = await localSearch.syncSource(source, force);
    return {
      success: result.success,
      itemsSynced: result.itemsSynced,
      itemsFailed: result.itemsFailed,
    };
  } catch (error) {
    logger.error('sync:trigger error:', error);
    return { success: false, error: String(error) };
  }
});
```

#### 1-4. Settings UI에 Force Re-sync 버튼 추가

**파일**: `src/renderer/settings.html`

**변경 위치**: Data Sync 섹션의 각 sync-source-row (Line 651, 664, 674, 685)

**HTML 변경** (Linear row 예시):
```html
<!-- Linear Row -->
<div class="sync-source-row" id="syncLinearRow" data-source="linear">
  <!-- 기존 아이콘, 이름, 상태 유지 -->
  <button class="btn-sync" id="syncLinearBtn" disabled data-i18n="sync.syncNow">Sync Now</button>
  <button class="btn-sync btn-force" id="forceSyncLinearBtn" disabled 
          style="margin-left: 4px; background: #fef2f2; border-color: #fecaca; color: #dc2626;"
          data-i18n="sync.forceSync">Force</button>
</div>
```

**CSS 추가** (style 섹션):
```css
.btn-force:hover:not(:disabled) {
  background: #fee2e2;
}
```

**JavaScript 변경** (script 섹션):
```javascript
// Force sync 버튼 핸들러 추가
const forceSyncLinearBtn = document.getElementById('forceSyncLinearBtn');

forceSyncLinearBtn.addEventListener('click', async () => {
  const confirmMsg = await t('sync.forceConfirm');
  if (!confirm(confirmMsg || 'This will delete existing data and re-sync. Continue?')) {
    return;
  }
  
  forceSyncLinearBtn.disabled = true;
  syncLinearStatus.textContent = await t('sync.syncing');
  syncLinearStatus.className = 'sync-source-status syncing';
  
  try {
    const result = await ipcRenderer.invoke('sync:trigger', { source: 'linear', force: true });
    if (result.success) {
      syncLinearStatus.textContent = `${result.itemsSynced} items synced`;
    } else {
      syncLinearStatus.textContent = result.error || 'Sync failed';
      syncLinearStatus.className = 'sync-source-status error';
    }
  } catch (error) {
    syncLinearStatus.textContent = error.message || 'Sync failed';
    syncLinearStatus.className = 'sync-source-status error';
  } finally {
    forceSyncLinearBtn.disabled = false;
    await loadSyncStatus();
  }
});
```

**i18n 키 추가** (locales/en/translation.json):
```json
{
  "sync": {
    "forceSync": "Force",
    "forceConfirm": "This will delete all existing data and re-sync from scratch. Continue?"
  }
}
```

---

### Phase 2: FTS에 metadata 포함 (선택적 개선)

#### 2-1. 스키마 마이그레이션 추가

**파일**: `src/services/database.ts`

**변경 내용**:
```typescript
// Migration 2: Add metadata to FTS
if (currentVersion < 2) {
  console.log('[DatabaseService] Running migration 2: FTS metadata');
  
  await this.db.exec(`
    -- Drop and recreate tsv column with metadata
    ALTER TABLE documents DROP COLUMN IF EXISTS tsv;
    ALTER TABLE documents ADD COLUMN tsv tsvector 
      GENERATED ALWAYS AS (
        setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('simple', content), 'B') ||
        setweight(to_tsvector('simple', coalesce(metadata->>'assigneeName', '')), 'C') ||
        setweight(to_tsvector('simple', coalesce(metadata->>'projectName', '')), 'C') ||
        setweight(to_tsvector('simple', coalesce(metadata->>'teamName', '')), 'C')
      ) STORED;
    
    -- Recreate FTS index
    DROP INDEX IF EXISTS idx_documents_tsv;
    CREATE INDEX idx_documents_tsv ON documents USING gin(tsv);
    
    UPDATE schema_version SET version = 2;
  `);
}
```

**주의**: PGlite에서 GENERATED ALWAYS 컬럼 변경 지원 여부 확인 필요

---

## 실행 순서

```
Phase 1 (Force Re-sync):
├── 1-1: LinearSyncAdapter.syncFull() 추가 (10분)
│         파일: src/services/sync-adapters/linear-sync.ts
├── 1-2: LocalSearchService.syncSource() force 옵션 (10분)
│         파일: src/services/local-search.ts
├── 1-3: IPC sync:trigger 핸들러 수정 (10분)
│         파일: src/main/ipc-handlers.ts
├── 1-4: Settings UI Force 버튼 + i18n (20분)
│         파일: src/renderer/settings.html
│         파일: locales/en/translation.json (+ 번역 실행)
    ↓
빌드: npm run build
    ↓
테스트: npm run pack:clean
    ↓
검증: Force Re-sync 실행 후 "cto" 검색 확인
    ↓
Phase 2 (FTS 개선 - 선택적):
├── 2-1: 스키마 마이그레이션 (30분)
└── 테스트: FTS 검색 확인
```

---

## 성공 기준

### Phase 1 완료 시
- [ ] Settings > Data Sync에 Linear "Force" 버튼 표시
- [ ] Force 클릭 시 확인 다이얼로그 표시
- [ ] Force re-sync 후 콘솔에 `[LinearSync] Force re-sync: existing data cleared` 로그
- [ ] Force re-sync 후 "cto" 검색 시 담당자가 "CTO ..."인 이슈 표시
- [ ] 기존 "Sync Now" 버튼은 여전히 incremental sync 수행

### Phase 2 완료 시 (선택적)
- [ ] FTS에서도 metadata 검색 가능
- [ ] 긴 검색어 (4글자 이상)에서도 담당자/프로젝트명 검색 가능

---

## 참고: 현재 브랜치

`feature/local-sync-integration`

## 관련 파일

| 파일 | 역할 | 변경 내용 |
|------|------|----------|
| `src/services/sync-adapters/linear-sync.ts` | Linear 동기화 로직 | `syncFull(clearExisting)` 메서드 추가 |
| `src/services/local-search.ts` | 검색 + 동기화 라우팅 | `syncSource(source, force)` 수정 |
| `src/main/ipc-handlers.ts` | IPC 핸들러 | `sync:trigger`에 force 옵션 추가 |
| `src/renderer/settings.html` | 설정 UI | Force 버튼 + 핸들러 추가 |
| `locales/en/translation.json` | i18n | `sync.forceSync`, `sync.forceConfirm` 키 추가 |
| `src/services/database.ts` | DB 스키마 (Phase 2) | FTS에 metadata 포함 (선택적) |
