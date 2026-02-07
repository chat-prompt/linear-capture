# Linear Sync Performance Optimization

## TL;DR

> **Quick Summary**: Linear 동기화 성능을 대폭 개선합니다. 댓글 동기화 제거, 병렬 처리(10개 배치), 임베딩 배치 처리, 관계 로딩 병렬화를 통해 **예상 15-20배 이상** 속도 향상.
> 
> **Deliverables**:
> - `linear-sync.ts` 최적화 (댓글 제거 + 병렬화)
> - `linear-sync.test.ts` 단위 테스트 추가
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4

---

## Context

### Original Request
"리니어 동기화가 유달리 오래 걸리는데 이거 개선이 가능할까?"

### Interview Summary
**Key Discussions**:
- 댓글 동기화 제거하여 단순화 (이슈만 동기화)
- 기존 댓글 데이터는 DB에 유지
- 10개씩 병렬 배치 처리
- Promise.all로 관계(team, project, state 등) 병렬 로딩
- 임베딩 배치 처리 적용
- 부분 실패 시 계속 진행 (에러 기록)
- 커서는 성공한 것만 반영

**Research Findings**:
- 현재 `syncIssue()`에서 5개 관계를 순차 await (병목 원인)
- `embedding-client.ts`에 이미 `embed(texts[])` 배치 메서드 존재
- 현재 `embedSingle()` 개별 호출 → 비효율

### Metis Review
**Identified Gaps** (addressed):
- 부분 실패 처리 전략: "계속 진행, 에러 기록"으로 결정
- 커서 업데이트 전략: "성공한 것만 반영"으로 결정
- labels() 메서드 처리: await 후 Promise.all에 포함
- null 관계 처리: 기존 optional chaining 패턴 유지

---

## Work Objectives

### Core Objective
Linear 이슈 동기화 성능을 대폭 개선하고 코드를 단순화합니다.

### Concrete Deliverables
- `src/services/sync-adapters/linear-sync.ts` (수정)
- `src/services/sync-adapters/__tests__/linear-sync.test.ts` (신규)

### Definition of Done
- [ ] 댓글 관련 코드 완전 제거
- [ ] 관계 로딩 병렬화 (Promise.all)
- [ ] 10개씩 배치 처리 구현
- [ ] 임베딩 배치 처리 적용
- [ ] 모든 단위 테스트 통과
- [ ] 기존 기능 유지 (이슈 동기화)

### Must Have
- 이슈 동기화 기능 정상 동작
- 부분 실패 시 다른 이슈 계속 처리
- itemsSynced/itemsFailed 정확한 카운트
- content_hash 변경 감지 유지

### Must NOT Have (Guardrails)
- ❌ 데이터베이스 스키마 변경
- ❌ embedding-client.ts 수정
- ❌ SyncResult 인터페이스 변경
- ❌ 재시도 메커니즘 추가 (scope 외)
- ❌ 캐싱 추가 (scope 외)
- ❌ 기존 댓글 데이터 삭제
- ❌ 새 npm 의존성 추가

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks MUST be verifiable WITHOUT any human action.

### Test Decision
- **Infrastructure exists**: YES (bun test)
- **Automated tests**: YES (Tests-after)
- **Framework**: bun test

### Agent-Executed QA Scenarios (MANDATORY)

모든 검증은 테스트 명령어와 grep으로 수행합니다.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: 댓글 동기화 코드 제거
└── (독립적)

Wave 2 (After Task 1):
├── Task 2: 관계 로딩 병렬화
└── Task 3: 배치 처리 구현 (병렬 가능하나 Task 2와 충돌 가능 → 순차 권장)

Wave 3 (After Wave 2):
└── Task 4: 단위 테스트 작성
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2, 3 | None |
| 2 | 1 | 4 | 3 (but sequential safer) |
| 3 | 1 | 4 | 2 (but sequential safer) |
| 4 | 2, 3 | None | None |

---

## TODOs

- [ ] 1. 댓글 동기화 코드 제거

  **What to do**:
  - `syncComments()` 메서드 완전 삭제
  - `syncComment()` 메서드 완전 삭제
  - `sync()` 및 `syncIncremental()`에서 `syncComments()` 호출 제거
  - 관련 import 정리 (Comment 타입 등)

  **Must NOT do**:
  - 데이터베이스에서 기존 댓글 데이터 삭제
  - SyncResult 인터페이스 변경

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단순 코드 삭제 작업, 복잡한 로직 없음
  - **Skills**: [`git-master`]
    - `git-master`: 깔끔한 커밋 생성 필요

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (단독)
  - **Blocks**: Task 2, 3
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/services/sync-adapters/linear-sync.ts:301-352` - syncComments() 메서드 (삭제 대상)
  - `src/services/sync-adapters/linear-sync.ts:357-420` - syncComment() 메서드 (삭제 대상)

  **Code Location References**:
  - `src/services/sync-adapters/linear-sync.ts:85-92` - sync()에서 syncComments 호출 (제거)
  - `src/services/sync-adapters/linear-sync.ts:173-180` - syncIncremental()에서 syncComments 호출 (제거)
  - `src/services/sync-adapters/linear-sync.ts:21` - Comment 타입 import (제거 가능)

  **Acceptance Criteria**:

  **Functional Verification (Agent-Executed):**
  ```
  Scenario: syncComments 메서드 완전 제거 확인
    Tool: Bash (grep)
    Steps:
      1. grep -n "syncComments\|syncComment" src/services/sync-adapters/linear-sync.ts
    Expected Result: 출력 없음 (0 matches)
    Evidence: grep 출력 캡처

  Scenario: Comment 타입 import 제거 확인
    Tool: Bash (grep)
    Steps:
      1. grep -n "Comment" src/services/sync-adapters/linear-sync.ts | grep import
    Expected Result: 출력 없음 또는 필수 import만 존재
    Evidence: grep 출력 캡처

  Scenario: TypeScript 컴파일 성공 확인
    Tool: Bash
    Steps:
      1. npx tsc --noEmit src/services/sync-adapters/linear-sync.ts
    Expected Result: exit code 0, 에러 없음
    Evidence: 명령어 출력 캡처
  ```

  **Commit**: YES
  - Message: `refactor(linear-sync): remove comment synchronization for performance`
  - Files: `src/services/sync-adapters/linear-sync.ts`
  - Pre-commit: `npx tsc --noEmit`

---

- [ ] 2. 관계 로딩 병렬화 (Promise.all)

  **What to do**:
  - `syncIssue()` 메서드에서 순차 await를 Promise.all로 변경
  - team, project, state, assignee를 동시에 로딩
  - labels()는 함수 호출이므로 먼저 실행 후 Promise.all에 포함
  - null/undefined 처리 유지 (optional chaining)

  **Must NOT do**:
  - 캐싱 로직 추가
  - 에러 처리 로직 변경

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단일 메서드 내 비동기 패턴 변경
  - **Skills**: []
    - 특별한 스킬 불필요

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3, but sequential safer)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 4
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/services/sync-adapters/linear-sync.ts:214-246` - syncIssue() 메서드 (수정 대상)
  - `src/services/sync-adapters/notion-sync.ts:213-240` - 유사한 병렬 처리 패턴 참고

  **Code to Change** (현재):
  ```typescript
  // lines 217-222 - 순차 await (병목)
  const team = await issue.team;
  const project = await issue.project;
  const state = await issue.state;
  const assignee = await issue.assignee;
  const labelsConnection = await issue.labels();
  ```

  **Target Pattern**:
  ```typescript
  // 병렬 로딩
  const [team, project, state, assignee, labelsConnection] = await Promise.all([
    issue.team,
    issue.project,
    issue.state,
    issue.assignee,
    issue.labels(),
  ]);
  ```

  **Acceptance Criteria**:

  **Functional Verification (Agent-Executed):**
  ```
  Scenario: Promise.all 패턴 적용 확인
    Tool: Bash (grep)
    Steps:
      1. grep -A5 "Promise.all" src/services/sync-adapters/linear-sync.ts | head -20
    Expected Result: Promise.all([issue.team, issue.project, ...]) 패턴 존재
    Evidence: grep 출력 캡처

  Scenario: 순차 await 제거 확인
    Tool: Bash (grep)
    Steps:
      1. grep -c "await issue.team" src/services/sync-adapters/linear-sync.ts
    Expected Result: 0 (순차 await 없음)
    Evidence: grep 출력 캡처

  Scenario: TypeScript 컴파일 성공 확인
    Tool: Bash
    Steps:
      1. npx tsc --noEmit src/services/sync-adapters/linear-sync.ts
    Expected Result: exit code 0
    Evidence: 명령어 출력 캡처
  ```

  **Commit**: YES
  - Message: `perf(linear-sync): parallelize relation loading with Promise.all`
  - Files: `src/services/sync-adapters/linear-sync.ts`
  - Pre-commit: `npx tsc --noEmit`

---

- [ ] 3. 배치 처리 구현 (이슈 병렬 + 임베딩 배치)

  **What to do**:
  - `sync()` 및 `syncIncremental()`에서 이슈를 10개씩 배치로 처리
  - 각 배치 내에서 Promise.allSettled로 병렬 처리
  - 배치 내 모든 텍스트를 모아서 `embed()` 한 번 호출
  - 부분 실패 시 성공한 것만 카운트
  - 커서는 성공한 이슈 중 가장 최신 updatedAt으로 업데이트

  **Must NOT do**:
  - 배치 사이즈를 설정 가능하게 만들기 (하드코딩 10)
  - embedding-client.ts 수정
  - 재시도 로직 추가

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: 루프 구조 변경 + 비동기 패턴 변경이지만 복잡하지 않음
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2, but sequential safer)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 4
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/services/sync-adapters/gmail-sync.ts:129-210` - 배치 처리 패턴 참고 (processBatchWithEmbedding)
  - `src/services/sync-adapters/notion-sync.ts:213-240` - 배치 임베딩 패턴 참고
  - `src/services/embedding-client.ts:20-33` - embed() 배치 메서드 (사용할 것)

  **Type References**:
  - `src/services/embedding-client.ts:EmbeddingClient` - embed(texts[]) 시그니처

  **Code Structure to Implement**:
  ```typescript
  // 배치 처리 헬퍼 함수
  private async processBatch(issues: Issue[]): Promise<BatchResult> {
    // 1. 모든 이슈의 관계 로딩 (병렬)
    // 2. 모든 텍스트 수집
    // 3. 배치 임베딩 (embed(allTexts))
    // 4. DB 저장 (병렬)
    // 5. 결과 집계
  }

  // sync() / syncIncremental()에서 사용
  const BATCH_SIZE = 10;
  for (let i = 0; i < issues.length; i += BATCH_SIZE) {
    const batch = issues.slice(i, i + BATCH_SIZE);
    const batchResult = await this.processBatch(batch);
    // 결과 집계
  }
  ```

  **Acceptance Criteria**:

  **Functional Verification (Agent-Executed):**
  ```
  Scenario: 배치 상수 정의 확인
    Tool: Bash (grep)
    Steps:
      1. grep -n "BATCH_SIZE\|batchSize" src/services/sync-adapters/linear-sync.ts
    Expected Result: BATCH_SIZE = 10 또는 유사 패턴 존재
    Evidence: grep 출력 캡처

  Scenario: embed() 배치 호출 확인 (embedSingle 미사용)
    Tool: Bash (grep)
    Steps:
      1. grep -c "embedSingle" src/services/sync-adapters/linear-sync.ts
    Expected Result: 0
    Evidence: grep 출력 캡처

  Scenario: Promise.allSettled 사용 확인
    Tool: Bash (grep)
    Steps:
      1. grep -n "Promise.allSettled" src/services/sync-adapters/linear-sync.ts
    Expected Result: 최소 1개 이상 매치
    Evidence: grep 출력 캡처

  Scenario: TypeScript 컴파일 성공 확인
    Tool: Bash
    Steps:
      1. npx tsc --noEmit src/services/sync-adapters/linear-sync.ts
    Expected Result: exit code 0
    Evidence: 명령어 출력 캡처
  ```

  **Commit**: YES
  - Message: `perf(linear-sync): implement batch processing with parallel issues and batch embedding`
  - Files: `src/services/sync-adapters/linear-sync.ts`
  - Pre-commit: `npx tsc --noEmit`

---

- [ ] 4. 단위 테스트 작성

  **What to do**:
  - `linear-sync.test.ts` 파일 생성
  - Mock Linear Client로 API 호출 없이 테스트
  - 테스트 케이스:
    1. 배치 처리 동작 확인
    2. 병렬 관계 로딩 확인
    3. 배치 임베딩 호출 확인
    4. 부분 실패 처리 확인 (1개 실패 시 나머지 성공)
    5. 빈 이슈 목록 처리
    6. null 관계 처리

  **Must NOT do**:
  - 실제 Linear API 호출
  - 실제 Embedding API 호출
  - E2E 테스트 작성

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: 테스트 코드 작성, 기존 패턴 참고 가능
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (단독)
  - **Blocks**: None
  - **Blocked By**: Task 2, 3

  **References**:

  **Test Pattern References**:
  - `src/services/sync-adapters/__tests__/notion-sync.test.ts` - 동기화 테스트 패턴
  - `src/services/sync-adapters/__tests__/gmail-sync.test.ts` - Mock 패턴 참고

  **Mock Setup Reference**:
  ```typescript
  // gmail-sync.test.ts에서 참고
  vi.mock('../gmail-client', () => ({
    getGmailService: vi.fn(() => mockGmailService),
  }));
  ```

  **Test File Structure**:
  ```typescript
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { LinearSyncAdapter } from '../linear-sync';

  vi.mock('../linear-client', () => ({...}));
  vi.mock('../embedding-client', () => ({...}));
  vi.mock('../database', () => ({...}));

  describe('LinearSyncAdapter', () => {
    describe('batch processing', () => {...});
    describe('parallel relation loading', () => {...});
    describe('batch embedding', () => {...});
    describe('partial failure handling', () => {...});
    describe('edge cases', () => {...});
  });
  ```

  **Acceptance Criteria**:

  **Functional Verification (Agent-Executed):**
  ```
  Scenario: 테스트 파일 존재 확인
    Tool: Bash (ls)
    Steps:
      1. ls -la src/services/sync-adapters/__tests__/linear-sync.test.ts
    Expected Result: 파일 존재
    Evidence: ls 출력 캡처

  Scenario: 모든 테스트 통과
    Tool: Bash (bun test)
    Steps:
      1. bun test src/services/sync-adapters/__tests__/linear-sync.test.ts
    Expected Result: 모든 테스트 PASS, exit code 0
    Evidence: 테스트 출력 캡처

  Scenario: 테스트 커버리지 확인 (최소 5개 테스트)
    Tool: Bash (grep)
    Steps:
      1. grep -c "it\|test(" src/services/sync-adapters/__tests__/linear-sync.test.ts
    Expected Result: 5 이상
    Evidence: grep 출력 캡처
  ```

  **Commit**: YES
  - Message: `test(linear-sync): add unit tests for optimized sync`
  - Files: `src/services/sync-adapters/__tests__/linear-sync.test.ts`
  - Pre-commit: `bun test src/services/sync-adapters/__tests__/linear-sync.test.ts`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `refactor(linear-sync): remove comment synchronization for performance` | linear-sync.ts | tsc --noEmit |
| 2 | `perf(linear-sync): parallelize relation loading with Promise.all` | linear-sync.ts | tsc --noEmit |
| 3 | `perf(linear-sync): implement batch processing with parallel issues and batch embedding` | linear-sync.ts | tsc --noEmit |
| 4 | `test(linear-sync): add unit tests for optimized sync` | linear-sync.test.ts | bun test |

---

## Success Criteria

### Verification Commands
```bash
# 1. 컴파일 확인
npx tsc --noEmit

# 2. 테스트 통과
bun test src/services/sync-adapters/__tests__/linear-sync.test.ts

# 3. 댓글 코드 완전 제거 확인
grep -c "syncComment" src/services/sync-adapters/linear-sync.ts  # Expected: 0

# 4. 병렬 처리 패턴 확인
grep "Promise.all\|Promise.allSettled" src/services/sync-adapters/linear-sync.ts  # Expected: 2+ matches

# 5. 배치 임베딩 확인 (embedSingle 미사용)
grep -c "embedSingle" src/services/sync-adapters/linear-sync.ts  # Expected: 0
```

### Final Checklist
- [ ] 댓글 동기화 코드 완전 제거
- [ ] Promise.all로 관계 로딩 병렬화
- [ ] 10개씩 배치 처리 구현
- [ ] 배치 임베딩 적용 (embedSingle → embed)
- [ ] 부분 실패 처리 (계속 진행)
- [ ] 커서는 성공한 것만 반영
- [ ] 모든 단위 테스트 통과
- [ ] TypeScript 컴파일 에러 없음
