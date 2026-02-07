# Notion Sync 페이지네이션 수정

## TL;DR

> **Quick Summary**: Notion sync가 6개 페이지만 동기화하는 버그 수정 - 페이지네이션 누락이 원인. `sync()`와 `syncIncremental()`에 cursor 기반 페이지네이션 루프 추가.
> 
> **Deliverables**:
> - `src/services/sync-adapters/__tests__/notion-sync.test.ts` - 새 테스트 파일
> - `src/services/sync-adapters/notion-sync.ts` - 페이지네이션 루프 추가
> - `src/services/notion-client.ts` - cursor 파라미터 지원
> 
> **Estimated Effort**: Medium (4-6시간)
> **Parallel Execution**: NO - sequential (TDD flow)
> **Critical Path**: Task 0 → Task 1 → Task 2 → Task 3 → Task 4 → Task 5

---

## Context

### Original Request
Notion 로컬 문서 연동이 21k 페이지 중 6개만 sync되는 문제 해결. git-worktree를 활용하여 현재 작업(gmail-sync-speed)과 분리해서 진행.

### Interview Summary
**Key Discussions**:
- **브랜치 전략**: master에서 분기, `../linear-capture-worktrees/notion-sync-fix`
- **해결 방향**: Full Sync 로직 점검 + 재실행
- **테스트**: TDD (Vitest)

**Research Findings**:
- 근본 원인: `searchPages('', 100)` 한 번만 호출, nextCursor 무시
- 핵심 파일: `src/services/sync-adapters/notion-sync.ts`
- 테스트 템플릿: `src/services/__tests__/gmail-sync.test.ts`

### Metis Review
**Identified Gaps** (addressed):
- **데이터 소스**: 로컬 캐시 우선 + API 폴백 (현재 로직 유지)
- **실패 처리**: Resume 가능하게 (커서 저장)
- **컨텐츠 전략**: 메타데이터만 먼저 (on-demand 컨텐츠)

---

## Work Objectives

### Core Objective
Notion sync에 페이지네이션을 추가하여 21k 페이지 전체를 동기화할 수 있게 함.

### Concrete Deliverables
- `src/services/sync-adapters/__tests__/notion-sync.test.ts` (새 파일)
- `src/services/sync-adapters/notion-sync.ts` (수정)
- `src/services/notion-client.ts` (수정)

### Definition of Done
- [ ] `npm test` - 모든 테스트 통과
- [ ] `npx tsc --noEmit` - 타입 체크 통과
- [ ] 페이지네이션 루프가 `hasMore` false까지 반복
- [ ] 중단 시 커서 저장되어 resume 가능

### Must Have
- `sync()` 메서드에 while 루프 + nextCursor 처리
- `syncIncremental()` 메서드에 동일하게 적용
- `searchPages()` 함수에 cursor 파라미터 추가
- 실패 시 커서 저장하여 resume 가능

### Must NOT Have (Guardrails)
- ❌ `syncPage()` 메서드 수정 (컨텐츠 추출 로직 건드리지 않음)
- ❌ Database schema 변경
- ❌ `NotionLocalReader` 클래스 수정
- ❌ 병렬/동시 fetching 추가
- ❌ 새 DB 테이블 추가
- ❌ 진행률 UI 추가

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> 모든 검증은 에이전트가 도구를 사용하여 자동으로 수행합니다.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: TDD
- **Framework**: Vitest v4.0.18

### TDD Workflow

각 TODO는 RED-GREEN-REFACTOR 패턴을 따릅니다:

**Task Structure:**
1. **RED**: 실패하는 테스트 먼저 작성
   - Test command: `npm test src/services/sync-adapters/__tests__/notion-sync.test.ts`
   - Expected: FAIL
2. **GREEN**: 테스트 통과하는 최소 코드 구현
   - Expected: PASS
3. **REFACTOR**: 코드 정리
   - Expected: PASS (유지)

### Agent-Executed QA Scenarios (MANDATORY)

> 모든 Task에 적용됨 - 에이전트가 직접 검증 수행

**Verification Tool by Type:**
| Type | Tool | How |
|------|------|-----|
| Test | Bash | `npm test` 실행, 결과 확인 |
| Type Check | Bash | `npx tsc --noEmit` |
| Code Pattern | Grep | 특정 패턴 존재 확인 |

---

## Execution Strategy

### Sequential Execution (TDD)

```
Task 0: Git Worktree 설정
    ↓
Task 1: 테스트 파일 생성 + 기본 구조
    ↓
Task 2: searchPages cursor 파라미터 추가
    ↓
Task 3: sync() 페이지네이션 구현
    ↓
Task 4: syncIncremental() 페이지네이션 구현
    ↓
Task 5: Resume 기능 (커서 저장)
    ↓
Task 6: 최종 검증 + 커밋
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|------------|--------|
| 0 | None | 1, 2, 3, 4, 5, 6 |
| 1 | 0 | 2, 3, 4, 5 |
| 2 | 1 | 3, 4 |
| 3 | 2 | 5 |
| 4 | 2 | 5 |
| 5 | 3, 4 | 6 |
| 6 | 5 | None |

---

## TODOs

- [x] 0. Git Worktree 설정

  **What to do**:
  - master 브랜치에서 새 worktree 생성
  - `git worktree add ../linear-capture-worktrees/notion-sync-fix -b feature/notion-sync-pagination master`
  - 새 worktree에서 `npm install` 실행

  **Must NOT do**:
  - 현재 feature/gmail-sync-speed 브랜치 건드리지 않음

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단순한 git/npm 명령어 실행
  - **Skills**: [`git-master`]
    - `git-master`: worktree 명령어 참고

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (첫 번째)
  - **Blocks**: Tasks 1-6
  - **Blocked By**: None

  **References**:
  - `docs/AI_CASE_STUDIES.md` - worktree 구조 가이드

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Worktree 생성 성공
    Tool: Bash
    Steps:
      1. git worktree list
      2. Assert: "../linear-capture-worktrees/notion-sync-fix" 경로 존재
      3. Assert: "feature/notion-sync-pagination" 브랜치
    Expected Result: 새 worktree가 목록에 표시됨
  
  Scenario: Dependencies 설치 완료
    Tool: Bash (in worktree directory)
    Steps:
      1. ls node_modules
      2. Assert: node_modules 디렉토리 존재
    Expected Result: npm install 완료
  ```

  **Commit**: NO (worktree 설정은 커밋 대상 아님)

---

- [x] 1. 테스트 파일 생성 + 기본 구조

  **What to do**:
  - `src/services/sync-adapters/__tests__/notion-sync.test.ts` 생성
  - `gmail-sync.test.ts` 패턴 참고하여 기본 mock 구조 설정
  - describe 블록 구조만 먼저 작성 (빈 테스트)

  **Must NOT do**:
  - 아직 실제 테스트 로직 구현하지 않음 (구조만)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 파일 생성 + 기본 구조
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Tasks 2, 3, 4, 5
  - **Blocked By**: Task 0

  **References**:
  - `src/services/__tests__/gmail-sync.test.ts:1-80` - mock 패턴, describe 구조
  - `src/services/sync-adapters/notion-sync.ts:1-30` - import 대상

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 테스트 파일 존재 확인
    Tool: Bash
    Steps:
      1. ls src/services/sync-adapters/__tests__/notion-sync.test.ts
      2. Assert: 파일 존재
    Expected Result: 파일이 생성됨
  
  Scenario: 테스트 실행 가능
    Tool: Bash
    Steps:
      1. npm test src/services/sync-adapters/__tests__/notion-sync.test.ts
      2. Assert: 에러 없이 실행됨 (0 tests 또는 skip)
    Expected Result: Vitest가 파일을 인식함
  ```

  **Commit**: YES
  - Message: `test(notion): add notion-sync test file structure`
  - Files: `src/services/sync-adapters/__tests__/notion-sync.test.ts`

---

- [ ] 2. searchPages cursor 파라미터 추가 (TDD)

  **What to do**:
  - **RED**: `notion-sync.test.ts`에 cursor 파라미터 테스트 추가
    ```typescript
    it('should pass cursor to searchPages', async () => {
      // searchPages가 cursor와 함께 호출되는지 검증
    })
    ```
  - **GREEN**: `NotionService.searchPages()` 시그니처에 `cursor?: string` 추가
  - `searchPagesViaApi()`에 `start_cursor` 전달
  - **REFACTOR**: 타입 정리

  **Must NOT do**:
  - `NotionLocalReader.searchPages()` 수정하지 않음 (로컬은 페이지네이션 불필요)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단일 파라미터 추가
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: Task 1

  **References**:
  - `src/services/notion-client.ts:54-63` - NotionSearchResult 인터페이스 (hasMore, nextCursor 이미 존재)
  - `src/services/notion-client.ts:193-207` - searchPagesViaApi 함수

  **Acceptance Criteria**:

  **TDD:**
  - [ ] 테스트 파일에 cursor 전달 테스트 추가
  - [ ] `npm test src/services/sync-adapters/__tests__/notion-sync.test.ts` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: cursor 파라미터 시그니처 확인
    Tool: Bash (grep)
    Steps:
      1. grep -n "cursor" src/services/notion-client.ts
      2. Assert: searchPages 함수에 cursor 파라미터 존재
    Expected Result: cursor?: string 파라미터 발견
  
  Scenario: API에 start_cursor 전달 확인
    Tool: Bash (grep)
    Steps:
      1. grep -n "start_cursor" src/services/notion-client.ts
      2. Assert: searchPagesViaApi에서 start_cursor 사용
    Expected Result: start_cursor 전달 코드 발견
  
  Scenario: 타입 체크 통과
    Tool: Bash
    Steps:
      1. npx tsc --noEmit
      2. Assert: exit code 0
    Expected Result: 타입 에러 없음
  ```

  **Commit**: YES
  - Message: `feat(notion): add cursor parameter to searchPages`
  - Files: `src/services/notion-client.ts`, `src/services/sync-adapters/__tests__/notion-sync.test.ts`
  - Pre-commit: `npm test`

---

- [ ] 3. sync() 페이지네이션 구현 (TDD)

  **What to do**:
  - **RED**: 페이지네이션 루프 테스트 추가
    ```typescript
    describe('sync - pagination', () => {
      it('should fetch all pages across multiple API calls', async () => {
        // hasMore: true → 다음 페이지 fetch 검증
      })
      it('should stop when hasMore is false', async () => {
        // hasMore: false → 루프 종료 검증
      })
      it('should accumulate itemsSynced across pages', async () => {
        // 여러 페이지의 synced 카운트 합산
      })
    })
    ```
  - **GREEN**: `sync()` 메서드에 while 루프 추가
    ```typescript
    let cursor: string | undefined;
    let hasMore = true;
    while (hasMore) {
      const result = await this.notionService.searchPages('', 100, cursor);
      // ... process pages
      hasMore = result.hasMore ?? false;
      cursor = result.nextCursor ?? undefined;
    }
    ```
  - **REFACTOR**: 코드 정리

  **Must NOT do**:
  - `syncPage()` 메서드 수정하지 않음

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: 로직 수정이지만 패턴이 명확함
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 5
  - **Blocked By**: Task 2

  **References**:
  - `src/services/sync-adapters/notion-sync.ts:55-110` - 현재 sync() 메서드
  - `src/services/__tests__/gmail-sync.test.ts:100-150` - mock 패턴 참고

  **Acceptance Criteria**:

  **TDD:**
  - [ ] 페이지네이션 테스트 3개 추가
  - [ ] `npm test src/services/sync-adapters/__tests__/notion-sync.test.ts` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: while 루프 존재 확인
    Tool: Bash (grep)
    Steps:
      1. grep -A 30 "async sync():" src/services/sync-adapters/notion-sync.ts | grep -E "while|hasMore"
      2. Assert: while 루프와 hasMore 체크 존재
    Expected Result: 페이지네이션 루프 패턴 발견
  
  Scenario: nextCursor 처리 확인
    Tool: Bash (grep)
    Steps:
      1. grep -n "nextCursor" src/services/sync-adapters/notion-sync.ts
      2. Assert: cursor 변수에 nextCursor 할당
    Expected Result: cursor = result.nextCursor 패턴 발견
  
  Scenario: 모든 테스트 통과
    Tool: Bash
    Steps:
      1. npm test
      2. Assert: 모든 테스트 PASS
    Expected Result: 0 failures
  ```

  **Commit**: YES
  - Message: `feat(notion): implement pagination loop in sync()`
  - Files: `src/services/sync-adapters/notion-sync.ts`, `src/services/sync-adapters/__tests__/notion-sync.test.ts`
  - Pre-commit: `npm test`

---

- [ ] 4. syncIncremental() 페이지네이션 구현 (TDD)

  **What to do**:
  - **RED**: incremental sync 페이지네이션 테스트 추가
    ```typescript
    describe('syncIncremental - pagination', () => {
      it('should paginate when more pages exist')
      it('should filter by lastCursor across all paginated results')
    })
    ```
  - **GREEN**: `syncIncremental()` 메서드에 동일한 while 루프 추가
  - **REFACTOR**: sync()와 공통 로직 추출 고려 (선택사항)

  **Must NOT do**:
  - 과도한 추상화 (공통 함수 추출은 선택사항)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Task 3과 동일한 패턴 반복
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 5
  - **Blocked By**: Task 2

  **References**:
  - `src/services/sync-adapters/notion-sync.ts:115-180` - 현재 syncIncremental() 메서드
  - Task 3에서 구현한 sync() 페이지네이션 패턴

  **Acceptance Criteria**:

  **TDD:**
  - [ ] incremental 페이지네이션 테스트 2개 추가
  - [ ] `npm test src/services/sync-adapters/__tests__/notion-sync.test.ts` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: syncIncremental에도 while 루프 존재
    Tool: Bash (grep)
    Steps:
      1. grep -A 30 "async syncIncremental" src/services/sync-adapters/notion-sync.ts | grep -E "while|hasMore"
      2. Assert: 루프 존재
    Expected Result: 페이지네이션 루프 패턴 발견
  
  Scenario: 테스트 통과
    Tool: Bash
    Steps:
      1. npm test
      2. Assert: 모든 테스트 PASS
    Expected Result: 0 failures
  ```

  **Commit**: YES
  - Message: `feat(notion): implement pagination in syncIncremental()`
  - Files: `src/services/sync-adapters/notion-sync.ts`, `src/services/sync-adapters/__tests__/notion-sync.test.ts`
  - Pre-commit: `npm test`

---

- [ ] 5. Resume 기능 구현 (커서 저장)

  **What to do**:
  - **RED**: resume 관련 테스트 추가
    ```typescript
    describe('error handling', () => {
      it('should save cursor on mid-pagination failure')
      it('should resume from saved cursor')
    })
    ```
  - **GREEN**: 실패 시 현재 cursor를 `sync_cursors` 테이블에 저장
  - sync 시작 시 저장된 cursor가 있으면 해당 위치부터 시작
  - **REFACTOR**: 에러 핸들링 정리

  **Must NOT do**:
  - 새 DB 테이블 추가 (기존 sync_cursors 사용)
  - schema 변경

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: 기존 테이블 활용
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 3, 4

  **References**:
  - `src/services/database.ts` - sync_cursors 테이블 사용법
  - `src/services/sync-adapters/notion-sync.ts:45-50` - 기존 cursor 저장 로직

  **Acceptance Criteria**:

  **TDD:**
  - [ ] resume 테스트 2개 추가
  - [ ] `npm test` → PASS

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 실패 시 커서 저장 확인
    Tool: Bash (grep)
    Steps:
      1. grep -n "catch\|cursor" src/services/sync-adapters/notion-sync.ts
      2. Assert: catch 블록에서 cursor 저장 로직 존재
    Expected Result: 에러 핸들링에서 cursor 저장
  
  Scenario: 모든 테스트 통과
    Tool: Bash
    Steps:
      1. npm test
      2. Assert: 모든 테스트 PASS
    Expected Result: 0 failures
  ```

  **Commit**: YES
  - Message: `feat(notion): add resume capability on sync failure`
  - Files: `src/services/sync-adapters/notion-sync.ts`, `src/services/sync-adapters/__tests__/notion-sync.test.ts`
  - Pre-commit: `npm test`

---

- [ ] 6. 최종 검증 + 커밋

  **What to do**:
  - 전체 테스트 실행 및 통과 확인
  - 타입 체크 통과 확인
  - 최종 커밋 (필요시)

  **Must NOT do**:
  - 추가 기능 구현

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 검증만 수행
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Final
  - **Blocks**: None
  - **Blocked By**: Task 5

  **References**:
  - 없음 (검증 작업)

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 전체 테스트 통과
    Tool: Bash
    Steps:
      1. npm test
      2. Assert: 모든 테스트 PASS
      3. Assert: 새 notion-sync 테스트들 포함
    Expected Result: 0 failures
  
  Scenario: 타입 체크 통과
    Tool: Bash
    Steps:
      1. npx tsc --noEmit
      2. Assert: exit code 0
    Expected Result: 타입 에러 없음
  
  Scenario: 페이지네이션 코드 존재 최종 확인
    Tool: Bash (grep)
    Steps:
      1. grep -c "while" src/services/sync-adapters/notion-sync.ts
      2. Assert: 최소 2개 (sync, syncIncremental)
    Expected Result: 2개 이상의 while 루프
  ```

  **Commit**: YES (if needed)
  - Message: `chore(notion): finalize pagination implementation`
  - Pre-commit: `npm test && npx tsc --noEmit`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `test(notion): add notion-sync test file structure` | `__tests__/notion-sync.test.ts` | `npm test` |
| 2 | `feat(notion): add cursor parameter to searchPages` | `notion-client.ts`, `notion-sync.test.ts` | `npm test` |
| 3 | `feat(notion): implement pagination loop in sync()` | `notion-sync.ts`, `notion-sync.test.ts` | `npm test` |
| 4 | `feat(notion): implement pagination in syncIncremental()` | `notion-sync.ts`, `notion-sync.test.ts` | `npm test` |
| 5 | `feat(notion): add resume capability on sync failure` | `notion-sync.ts`, `notion-sync.test.ts` | `npm test` |
| 6 | `chore(notion): finalize pagination implementation` | - | `npm test && tsc` |

---

## Success Criteria

### Verification Commands
```bash
# 테스트 통과
npm test
# Expected: All tests pass (기존 + 새 notion-sync 테스트)

# 타입 체크
npx tsc --noEmit
# Expected: Exit code 0

# 페이지네이션 루프 존재
grep -c "while" src/services/sync-adapters/notion-sync.ts
# Expected: 2 이상

# cursor 파라미터 존재
grep "cursor" src/services/notion-client.ts | head -5
# Expected: searchPages에 cursor 파라미터
```

### Final Checklist
- [ ] 모든 "Must Have" 구현됨
- [ ] 모든 "Must NOT Have" 위반 없음
- [ ] 전체 테스트 통과
- [ ] 타입 체크 통과
- [ ] 새 worktree에서 독립적으로 작업 완료
