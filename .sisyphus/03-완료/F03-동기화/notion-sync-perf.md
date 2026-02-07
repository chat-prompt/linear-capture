# Notion Sync Performance Optimization

## TL;DR

> **Quick Summary**: 21k 페이지 동기화 시 앱 프리징 문제 해결. N+1 API 호출을 배치 처리로 전환하고, 병렬화 및 콘텐츠 제한으로 ~5배 성능 개선.
> 
> **Deliverables**:
> - `getFullPageContent()` 2000자 제한 추가
> - `syncFromApi()`에서 `embedBatch()` 사용으로 전환
> - `getPageContent()` 병렬 호출 (동시 3개)
> - 새 테스트 케이스 3개 추가
> 
> **Estimated Effort**: Medium (2-3시간)
> **Parallel Execution**: NO - sequential (의존성 있음)
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4
> **Working Directory**: `/Users/wine_ny/side-project/linear_project/linear-capture-worktrees/notion-sync-fix`

---

## Context

### Original Request
Notion 동기화 버튼을 눌렀을 때 21,000개 이상의 페이지를 가져오면서 앱이 거의 죽을 정도로 느려지는 문제 해결

### Interview Summary
**Key Discussions**:
- 페이지네이션 문제는 이미 해결됨 (21k 페이지 가져옴)
- 문제는 순차 처리로 인한 성능 저하
- 사용자는 "간단하면서 효과 좋은" 최적화만 원함

**Research Findings**:
- API 경로: `syncPage()` 안에서 페이지당 4번의 순차 await (N+1 문제)
- 로컬 경로: 이미 `embedBatch()` 사용 중 (상대적으로 최적화됨)
- `EmbeddingService.embedBatch()`: 배치 300개, 최대 300k 토큰 지원
- 현재 `MAX_TEXT_CHARS = 5000` (syncFromLocal), `getFullPageContent()`는 무제한

### Metis Review
**Identified Gaps** (addressed):
- 콘텐츠 제한 1000자 → 2000자로 조정 (검색 품질 균형)
- 동시성 10개 → 3개로 조정 (Notion rate limit 준수)
- API 경로만 → 양쪽 경로 모두 최적화

---

## Work Objectives

### Core Objective
21k 페이지 동기화 시간을 125분 → 25분으로 단축 (~5배 개선)

### Concrete Deliverables
- `src/services/notion-local-reader.ts` - `getFullPageContent()` 2000자 제한
- `src/services/sync-adapters/notion-sync.ts` - `syncFromApi()` 배치 임베딩 + 병렬 API
- `src/services/sync-adapters/__tests__/notion-sync.test.ts` - 새 테스트 3개

### Definition of Done
- [ ] `npx vitest run` → 12개 이상 테스트 통과 (기존 9 + 신규 3)
- [ ] `npm run build` → TypeScript 컴파일 성공
- [ ] 콘솔에 "Embedding batch" 로그 출력 (개별 embed 아님)

### Must Have
- 기존 9개 테스트 모두 통과
- 에러 발생 시 continue-on-failure 동작 유지
- cursor 저장 로직 유지 (중단 시 재개 가능)

### Must NOT Have (Guardrails)
- 함수 시그니처 변경 금지 (IPC 핸들러 호환성)
- 새 npm 의존성 추가 금지
- 데이터베이스 스키마 변경 금지
- 렌더러/UI 코드 수정 금지
- `collectBlockTexts()` depth 제한(10) 제거 금지

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: YES (tests-after)
- **Framework**: vitest

### Test Commands
```bash
npx vitest run src/services/sync-adapters/__tests__/notion-sync.test.ts
npm run build
```

---

## TODOs

- [ ] 1. getFullPageContent()에 2000자 제한 추가

  **What to do**:
  - `notion-local-reader.ts`의 `getFullPageContent()` 함수에 `maxChars` 파라미터 추가
  - `collectBlockTexts()`에서 누적 길이가 `maxChars` 초과 시 조기 종료
  - 기본값 2000자 설정

  **Must NOT do**:
  - 기존 `collectBlockTexts()` depth 제한(10) 변경 금지
  - 함수 시그니처의 기존 파라미터 순서 변경 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
    - 단순 파라미터 추가 및 조건문 추가 작업

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 2, 3, 4
  - **Blocked By**: None

  **References**:
  - `src/services/notion-local-reader.ts:579-590` - `getFullPageContent()` 현재 구현
  - `src/services/notion-local-reader.ts:595-642` - `collectBlockTexts()` 재귀 함수
  - `src/services/sync-adapters/notion-sync.ts:174` - `MAX_TEXT_CHARS = 5000` 참고 패턴

  **Acceptance Criteria**:
  - [ ] `getFullPageContent(pageId, 2000)` 호출 시 2000자 이하 반환
  - [ ] 기존 `getFullPageContent(pageId)` 호출도 동작 (기본값 적용)
  - [ ] `npm run build` 성공

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: TypeScript 컴파일 확인
    Tool: Bash
    Steps:
      1. npm run build
      2. Assert: exit code 0
    Expected Result: 컴파일 성공
  ```

  **Commit**: YES
  - Message: `perf(notion): add 2000 char limit to getFullPageContent`
  - Files: `src/services/notion-local-reader.ts`

---

- [ ] 2. syncFromApi()에서 embedBatch() 사용으로 전환

  **What to do**:
  - `syncFromApi()` 내부 구조 변경: 페이지 수집 → 배치 임베딩 → DB 저장
  - 기존 `for (page of pages) { syncPage() }` 패턴을 배치 처리로 교체
  - `syncFromLocal()`의 배치 패턴 (L204-266) 참고하여 구현
  - 배치 크기 300개 유지 (EmbeddingService 제한)

  **Must NOT do**:
  - `syncPage()` 함수 자체는 유지 (다른 곳에서 사용될 수 있음)
  - 에러 발생 시 전체 중단하지 않고 continue-on-failure 유지

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []
    - 기존 패턴 복사 + 적용 수준의 작업

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 3, 4
  - **Blocked By**: Task 1

  **References**:
  - `src/services/sync-adapters/notion-sync.ts:296-384` - `syncFromApi()` 현재 구현
  - `src/services/sync-adapters/notion-sync.ts:204-266` - `syncFromLocal()` 배치 패턴 (복사 대상)
  - `src/services/embedding-service.ts:69-121` - `embedBatch()` API

  **Acceptance Criteria**:
  - [ ] `syncFromApi()`가 `embedBatch()` 호출 (단일 `embed()` 아님)
  - [ ] 300개 단위로 배치 처리
  - [ ] 기존 9개 테스트 통과: `npx vitest run`
  - [ ] 콘솔에 "Embedding batch" 로그 출력

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: 기존 테스트 통과 확인
    Tool: Bash
    Steps:
      1. npx vitest run src/services/sync-adapters/__tests__/notion-sync.test.ts
      2. Assert: 9 tests pass
    Expected Result: All tests pass
  ```

  **Commit**: YES
  - Message: `perf(notion): use embedBatch in syncFromApi for 300x fewer API calls`
  - Files: `src/services/sync-adapters/notion-sync.ts`

---

- [ ] 3. getPageContent() 병렬 호출 구현 (동시 3개)

  **What to do**:
  - `syncFromApi()` 내에서 `getPageContent()` 호출을 병렬화
  - 동시 실행 3개로 제한 (Notion API rate limit 준수)
  - Promise pool 패턴 사용 (새 의존성 없이 구현)

  **Must NOT do**:
  - 새 npm 패키지 추가 금지 (`p-limit` 등)
  - 동시성 3개 초과 금지

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []
    - Promise 동시성 제어는 표준 패턴

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **References**:
  - `src/services/sync-adapters/notion-sync.ts` - syncFromApi 내부
  - `src/services/notion-client.ts:233-246` - `getPageContent()` 구현

  **Acceptance Criteria**:
  - [ ] `getPageContent()` 동시 최대 3개 실행
  - [ ] 기존 테스트 통과
  - [ ] `npm run build` 성공

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: 빌드 및 테스트 확인
    Tool: Bash
    Steps:
      1. npm run build && npx vitest run
      2. Assert: exit code 0, all tests pass
    Expected Result: 컴파일 + 테스트 성공
  ```

  **Commit**: YES
  - Message: `perf(notion): parallelize getPageContent with concurrency 3`
  - Files: `src/services/sync-adapters/notion-sync.ts`

---

- [ ] 4. 새 테스트 케이스 추가

  **What to do**:
  - `notion-sync.test.ts`에 3개 테스트 추가:
    1. `syncFromApi`가 `embedBatch` 사용하는지 확인
    2. 콘텐츠 2000자 truncation 확인
    3. 동시성이 3개를 초과하지 않는지 확인

  **Must NOT do**:
  - 기존 9개 테스트 수정/삭제 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
    - 기존 테스트 패턴 따라 추가

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (final)
  - **Blocks**: None
  - **Blocked By**: Task 3

  **References**:
  - `src/services/sync-adapters/__tests__/notion-sync.test.ts` - 기존 테스트 패턴
  - 기존 mock 설정 (L3-50) 재활용

  **Acceptance Criteria**:
  - [ ] 총 12개 이상 테스트 존재
  - [ ] `npx vitest run` → 모든 테스트 통과
  - [ ] 새 테스트가 실제 동작 검증 (mock 호출 확인)

  **Agent-Executed QA Scenarios**:
  ```
  Scenario: 전체 테스트 스위트 실행
    Tool: Bash
    Steps:
      1. npx vitest run src/services/sync-adapters/__tests__/notion-sync.test.ts
      2. Assert: 12+ tests, all pass
    Expected Result: 12개 이상 테스트 통과
  ```

  **Commit**: YES
  - Message: `test(notion): add tests for batch embedding and concurrency`
  - Files: `src/services/sync-adapters/__tests__/notion-sync.test.ts`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `perf(notion): add 2000 char limit to getFullPageContent` | notion-local-reader.ts | npm run build |
| 2 | `perf(notion): use embedBatch in syncFromApi` | notion-sync.ts | npx vitest run |
| 3 | `perf(notion): parallelize getPageContent with concurrency 3` | notion-sync.ts | npx vitest run |
| 4 | `test(notion): add tests for batch embedding and concurrency` | notion-sync.test.ts | npx vitest run |

---

## Success Criteria

### Verification Commands
```bash
npm run build          # Expected: exit 0
npx vitest run         # Expected: 12+ tests pass
```

### Final Checklist
- [ ] 기존 9개 테스트 통과
- [ ] 새 3개 테스트 통과
- [ ] TypeScript 컴파일 성공
- [ ] 함수 시그니처 변경 없음
- [ ] 새 npm 의존성 없음

### Performance Expectation
- Before: ~125분 (21k pages)
- After: ~25분 (21k pages)
- **~5배 개선**
