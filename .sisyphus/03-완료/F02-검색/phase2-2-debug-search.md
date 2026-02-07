# Phase 2-2: Semantic Search 결과 디버깅

## TL;DR

> **Quick Summary**: IPC 통신은 정상 작동하지만 검색 결과가 비어있는 원인 파악 및 수정
> 
> **Deliverables**:
> - 핸들러에 `_debug` 필드 추가로 DevTools에서 디버깅 가능
> - Slack 연결/검색 로직 문제점 파악
> - 시맨틱 검색 기능 정상 동작
> 
> **Estimated Effort**: Quick (~30분)
> **Parallel Execution**: NO - sequential
> **Critical Path**: Task 1 → Task 2 → Task 3

---

## Context

### Phase 2-1 결과
- ✅ `semantic-search.js` 인라인 이동 완료
- ✅ IPC 통신 정상 작동 (`ipcRenderer.invoke` → 응답 수신)
- ✅ `{success: true, results: Array(0)}` 반환

### 현재 문제
검색 결과가 비어있음:
```javascript
{success: true, results: Array(0)}
```

- `notConnected` 없음 → Slack 연결됨 (isConnected = true)
- `results: []` → 두 가지 가능성:
  1. `adapter.fetchItems(query)`가 빈 배열 반환
  2. `searchService.search()`가 빈 배열 반환

### 원인 추정
1. **Slack API 검색 실패**: `slackService.searchMessages()`가 실패하거나 결과 없음
2. **Worker API 문제**: 시맨틱 검색 Worker가 제대로 동작하지 않음
3. **데이터 변환 문제**: 검색 결과 파싱 오류

---

## Work Objectives

### Core Objective
핸들러에 `_debug` 필드를 추가하여 DevTools에서 각 단계의 상태를 확인할 수 있게 함

### Concrete Deliverables
- `src/main/index.ts`: `context-semantic-search` 핸들러에 `_debug` 배열 추가
- DevTools에서 `result._debug`로 각 단계 확인 가능

### Definition of Done
- [ ] DevTools에서 `_debug` 필드로 문제 원인 파악
- [ ] 시맨틱 검색 결과가 정상 반환됨

---

## TODOs

- [ ] 1. 핸들러에 `_debug` 필드 추가

  **What to do**:
  1. `context-semantic-search` 핸들러에 `debug: string[]` 배열 추가
  2. 각 단계에서 상태를 기록: adapter 생성, isConnected, fetchItems 결과, search 결과
  3. 모든 반환 객체에 `_debug: debug` 필드 추가

  **변경할 코드** (`src/main/index.ts:1090-1123`):
  ```typescript
  ipcMain.handle('context-semantic-search', async (_event, { query, source }) => {
    const debug: string[] = [];
    debug.push(`query="${query}", source="${source}"`);
    
    try {
      debug.push('Getting adapter...');
      const adapter = getAdapter(source as ContextSource);
      
      debug.push('Checking connection...');
      const isConnected = await adapter.isConnected();
      debug.push(`isConnected=${isConnected}`);
      
      if (!isConnected) {
        debug.push('Not connected, returning early');
        return { success: true, results: [], notConnected: true, _debug: debug };
      }
      
      debug.push('Fetching items...');
      const items = await adapter.fetchItems(query);
      debug.push(`fetchedItems=${items.length}`);
      
      if (items.length === 0) {
        debug.push('No items found, returning empty');
        return { success: true, results: [], _debug: debug };
      }
      
      debug.push('Calling semantic search service...');
      const searchService = getSemanticSearchService();
      const results = await searchService.search(query, items);
      debug.push(`searchResults=${results.length}`);
      
      return { success: true, results, _debug: debug };
    } catch (error) {
      debug.push(`ERROR: ${String(error)}`);
      return { success: false, error: String(error), results: [], _debug: debug };
    }
  });
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]

  **References**:
  - `src/main/index.ts:1090-1123` - 수정할 핸들러 위치

  **Acceptance Criteria**:
  ```bash
  # 빌드 확인
  npm run build
  # Assert: Exit code 0
  ```

  **Commit**: YES
  - Message: `debug(search): add _debug field to track search pipeline`
  - Files: `src/main/index.ts`

---

- [ ] 2. 앱 재빌드 및 테스트

  **What to do**:
  1. `npm run build` 실행
  2. `npm run pack` 실행
  3. 앱 실행 후 DevTools에서 테스트:
     ```javascript
     const result = await semanticSearch.search('테스트');
     console.log(result._debug);
     ```
  4. `_debug` 배열 분석하여 어디서 빈 배열이 반환되는지 파악

  **예상 _debug 출력 예시**:
  ```javascript
  // Case 1: Slack 연결 안됨
  ['query="테스트", source="slack"', 'Getting adapter...', 'Checking connection...', 'isConnected=false', 'Not connected, returning early']
  
  // Case 2: Slack 연결됨, 검색 결과 없음
  ['query="테스트", source="slack"', 'Getting adapter...', 'Checking connection...', 'isConnected=true', 'Fetching items...', 'fetchedItems=0', 'No items found, returning empty']
  
  // Case 3: 검색 성공
  ['query="테스트", source="slack"', 'Getting adapter...', 'Checking connection...', 'isConnected=true', 'Fetching items...', 'fetchedItems=5', 'Calling semantic search service...', 'searchResults=3']
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **References**:
  - CLAUDE.md의 테스트 원칙 참조

  **Acceptance Criteria**:
  - [ ] `_debug` 필드가 DevTools에서 확인됨
  - [ ] 문제 원인이 파악됨 (isConnected? fetchedItems? searchResults?)

  **Commit**: NO

---

- [ ] 3. 원인에 따른 수정 (Task 2 결과에 따라)

  **원인별 해결책**:

  ### Case A: `isConnected=false`
  - Slack 연결이 안 됨
  - **해결**: Settings에서 Slack 연결 필요
  - **코드 수정 불필요**

  ### Case B: `fetchedItems=0`
  - Slack API 검색이 결과를 반환하지 않음
  - **확인 필요**: 
    1. Slack workspace에 해당 쿼리로 검색 가능한 메시지가 있는지
    2. `slackService.searchMessages()` API가 제대로 동작하는지
  - **디버그 추가**: `slack-adapter.ts`의 `fetchItems`에 로그 추가

  ### Case C: `fetchedItems > 0` but `searchResults=0`
  - Worker API 문제
  - **확인 필요**: 
    1. Worker URL이 올바른지
    2. Worker가 제대로 응답하는지
  - **디버그 추가**: `semantic-search.ts`의 `callWorker`에 로그 추가

  **Recommended Agent Profile**:
  - **Category**: `quick` 또는 `unspecified-low`
  - **Skills**: []

  **Acceptance Criteria**:
  - [ ] 원인 파악 후 적절한 수정 적용
  - [ ] 시맨틱 검색이 결과를 반환함

---

## Commit Strategy

| After Task | Message | Files |
|------------|---------|-------|
| 1 | `debug(search): add _debug field to track search pipeline` | `src/main/index.ts` |
| 3 (if needed) | `fix(search): [원인에 따른 메시지]` | 해당 파일 |

---

## Success Criteria

### Final Verification
```javascript
// DevTools에서 실행
const result = await semanticSearch.search('테스트');
console.log('Results:', result.results.length);
console.log('Debug:', result._debug);
// Expected: results.length > 0 (Slack에 관련 메시지가 있을 경우)
```

### Final Checklist
- [x] `_debug` 필드로 문제 원인 파악됨
- [x] 원인에 따른 수정 완료
- [x] 시맨틱 검색이 정상 동작함

---

## Completion Notes (2026-02-02)

### 발견된 원인
Slack API `search.messages` 응답에서 Rich Message (봇/앱 메시지)의 경우:
- `text` 필드: 빈 문자열 `""`
- `blocks` 배열: 실제 메시지 내용 포함

### 수정 내용
1. **linear-capture (앱)**: `_debug` 필드 추가로 파이프라인 추적 가능
2. **linear-capture-worker**: `extractTextFromBlocks()` 함수 추가
   - `text`가 비어있으면 `blocks`에서 텍스트 추출
   - section, context 블록 타입 지원

### 커밋
- `debug(search): add _debug field to track search pipeline` (linear-capture)
- `fix(worker/slack): extract text from blocks when text is empty` (linear-capture-worker)
