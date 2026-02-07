# Gmail Sync Speed Improvement

## TL;DR

> **Quick Summary**: Gmail 동기화 속도 개선을 위해 배치 크기/대기시간을 튜닝하고, 실패 시 3회 재시도 로직과 에러 UI를 추가한다.
> 
> **Deliverables**:
> - Gmail sync 배치 상수 튜닝 (BATCH_SIZE 40→150, BATCH_DELAY_MS 500→200)
> - 지수 백오프 재시도 로직 (최대 3회, 1s→2s→4s)
> - Settings > Sync 섹션에 에러 상태 표시
> - 재시도 로직 유닛 테스트
> 
> **Estimated Effort**: Short (1-2 hours)
> **Parallel Execution**: NO - sequential
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4

---

## Context

### Original Request
Gmail 동기화가 전체적으로 느림 (100~500개 이메일에 1~3분 소요). 속도 개선과 실패 시 재시도 + 안내 문구 표시 요청.

### Interview Summary
**Key Discussions**:
- 상황: 전체적으로 다 느림 (초기/증분/수동 모두)
- 소요 시간: 1~3분 (100~500개 이메일)
- 개선 방향: 빠른 개선 (구조 변경 없이 튜닝)
- 재시도: 3회 시도 후 실패 안내
- 안내 위치: 설정 > 동기화 섹션
- 테스트: 유닛 테스트 추가

**Research Findings**:
- `gmail-sync.ts` 배치 설정: BATCH_SIZE=40, BATCH_DELAY_MS=500, MAX_BATCHES=25
- 현재 재시도 로직 없음 (line 76-78에서 실패 시 바로 throw)
- Settings UI에 `syncGmailStatus` 요소 존재, `.error` CSS 클래스 정의됨
- 프로젝트는 vitest 사용

### Metis Review
**Identified Gaps** (addressed):
- 성능 목표 미정의 → **기본값 적용**: 500개 이메일 60초 이내
- 에러 표시 위치 미정의 → **기존 `syncGmailStatus` 요소 사용**
- 재시도 범위 미정의 → **배치 단위 재시도**
- Auth 에러 vs 네트워크 에러 구분 → **재시도 불가 에러 타입 명시**

---

## Work Objectives

### Core Objective
Gmail 동기화 속도를 개선하고, 실패 시 안정적인 재시도와 사용자 알림을 제공한다.

### Concrete Deliverables
- `src/services/sync-adapters/gmail-sync.ts` 수정
- `src/renderer/settings.html` 에러 표시 로직 수정
- `src/services/__tests__/gmail-sync.test.ts` 테스트 파일 생성

### Definition of Done
- [ ] `npm run build` 성공
- [ ] `npm run test` 통과 (새 테스트 포함)
- [ ] 500개 이메일 동기화 60초 이내 (수동 검증)

### Must Have
- 배치 크기 증가 (40 → 150)
- 배치 대기시간 감소 (500ms → 200ms)
- 3회 재시도 with 지수 백오프 (1s → 2s → 4s)
- 재시도 불가 에러(401, 403) 즉시 실패
- 에러 시 UI 상태 표시 (`.error` 클래스)
- 유닛 테스트 추가

### Must NOT Have (Guardrails)
- 새 UI 요소 추가하지 않음 (기존 `syncGmailStatus` 사용)
- 다른 sync adapter (Slack/Notion/Linear) 수정하지 않음
- 프로그레스 인디케이터 추가하지 않음
- 취소 버튼 추가하지 않음
- 동기화 아키텍처 리팩토링하지 않음
- 임베딩 서비스 재시도 로직 변경하지 않음

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> 모든 검증은 자동화된 명령어 또는 도구로 수행됨.

### Test Decision
- **Infrastructure exists**: YES
- **Automated tests**: YES (Tests-after)
- **Framework**: vitest

### Agent-Executed QA Scenarios (MANDATORY)

**검증 도구별 활용:**
| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| Unit Tests | Bash (npm test) | 테스트 실행, 결과 확인 |
| Build | Bash (npm run build) | 컴파일 성공 확인 |
| UI | Playwright | 설정 열고 에러 상태 확인 |

---

## Execution Strategy

### Sequential Execution
```
Task 1: Batch tuning constants
    ↓
Task 2: Add retry logic with backoff
    ↓
Task 3: Update UI error display
    ↓
Task 4: Add unit tests
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2, 3, 4 | None |
| 2 | 1 | 3, 4 | None |
| 3 | 2 | 4 | None |
| 4 | 3 | None | None |

---

## TODOs

### Task 1: Tune Batch Constants

**What to do**:
- `BATCH_SIZE` 40 → 150으로 변경
- `BATCH_DELAY_MS` 500 → 200으로 변경
- `MAX_BATCHES`는 25 유지

**Must NOT do**:
- 다른 상수 변경하지 않음
- sync() / syncIncremental() 로직 변경하지 않음

**Recommended Agent Profile**:
- **Category**: `quick`
  - Reason: 단순 상수값 변경, 1개 파일 수정
- **Skills**: [`git-master`]
  - `git-master`: 커밋 메시지 작성

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Sequential
- **Blocks**: Task 2, 3, 4
- **Blocked By**: None

**References**:
- `src/services/sync-adapters/gmail-sync.ts:21-23` - 현재 상수 정의 위치

**Acceptance Criteria**:

- [ ] `BATCH_SIZE`가 150으로 변경됨
- [ ] `BATCH_DELAY_MS`가 200으로 변경됨
- [ ] `npm run build` 성공

**Agent-Executed QA Scenarios**:

```
Scenario: Build succeeds with new constants
  Tool: Bash
  Preconditions: None
  Steps:
    1. npm run build
    2. Assert: exit code 0
    3. Assert: dist/services/sync-adapters/gmail-sync.js exists
  Expected Result: Build completes without errors
  Evidence: Build output captured
```

**Commit**: YES
- Message: `perf(gmail-sync): tune batch constants for faster sync`
- Files: `src/services/sync-adapters/gmail-sync.ts`
- Pre-commit: `npm run build`

---

### Task 2: Add Retry Logic with Exponential Backoff

**What to do**:
- 재시도 유틸 함수 생성: `retryWithBackoff<T>(fn, options)`
  - `maxRetries`: 3
  - `initialDelayMs`: 1000
  - `backoffMultiplier`: 2
  - `retryableErrors`: network, 429, 5xx
  - `nonRetryableErrors`: 401, 403
- `searchEmails` 호출 부분(line 74, 165)에 재시도 로직 적용
- 최종 실패 시 에러 메시지에 재시도 횟수 포함

**Must NOT do**:
- 임베딩 서비스 재시도 로직 추가하지 않음
- 다른 함수에 재시도 적용하지 않음

**Recommended Agent Profile**:
- **Category**: `quick`
  - Reason: 단일 파일 수정, 로직 추가
- **Skills**: [`git-master`]

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Sequential
- **Blocks**: Task 3, 4
- **Blocked By**: Task 1

**References**:
- `src/services/sync-adapters/gmail-sync.ts:74` - sync()의 searchEmails 호출
- `src/services/sync-adapters/gmail-sync.ts:165` - syncIncremental()의 searchEmails 호출
- `src/services/gmail-client.ts:136-152` - searchEmails 함수 (에러 형식 확인)

**Acceptance Criteria**:

- [ ] `retryWithBackoff` 함수가 gmail-sync.ts에 추가됨
- [ ] `sync()` 내 searchEmails 호출이 retry로 감싸짐
- [ ] `syncIncremental()` 내 searchEmails 호출이 retry로 감싸짐
- [ ] 401, 403 에러는 즉시 실패 (재시도 안 함)
- [ ] 네트워크/429/5xx 에러는 3회까지 재시도
- [ ] 백오프 간격: 1s → 2s → 4s
- [ ] `npm run build` 성공

**Agent-Executed QA Scenarios**:

```
Scenario: Build succeeds with retry logic
  Tool: Bash
  Preconditions: Task 1 completed
  Steps:
    1. npm run build
    2. Assert: exit code 0
    3. grep -n "retryWithBackoff" dist/services/sync-adapters/gmail-sync.js
    4. Assert: function exists in compiled output
  Expected Result: Build succeeds with retry function present
  Evidence: Build output and grep result captured

Scenario: Verify retry function signature
  Tool: Bash
  Preconditions: Task 2 code written
  Steps:
    1. grep -A 20 "async function retryWithBackoff" src/services/sync-adapters/gmail-sync.ts
    2. Assert: maxRetries parameter exists
    3. Assert: exponential delay calculation exists
  Expected Result: Retry function has correct structure
  Evidence: grep output captured
```

**Commit**: YES
- Message: `feat(gmail-sync): add retry logic with exponential backoff`
- Files: `src/services/sync-adapters/gmail-sync.ts`
- Pre-commit: `npm run build`

---

### Task 3: Update Settings UI for Error Display

**What to do**:
- `triggerSync` 함수에서 실패 시 `syncGmailStatus`에 `.error` 클래스 추가
- 에러 메시지 표시: "동기화 실패 (3회 시도)" 형태
- 다음 성공 시 `.error` 클래스 제거
- i18n 키 추가 (필요시)

**Must NOT do**:
- 새 UI 요소 추가하지 않음
- 다른 sync source (Slack/Notion/Linear) UI 수정하지 않음

**Recommended Agent Profile**:
- **Category**: `quick`
  - Reason: HTML 파일 수정, 간단한 JS 로직 추가
- **Skills**: [`git-master`]

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Sequential
- **Blocks**: Task 4
- **Blocked By**: Task 2

**References**:
- `src/renderer/settings.html:1569-1605` - triggerSync 함수 및 Gmail 동기화 버튼 이벤트
- `src/renderer/settings.html:531-535` - `.sync-source-status.error` CSS 클래스
- `locales/ko/translation.json:224-232` - sync 관련 i18n 키

**Acceptance Criteria**:

- [ ] 동기화 실패 시 `syncGmailStatus`에 에러 메시지 표시
- [ ] 에러 시 `.error` CSS 클래스 적용
- [ ] 성공 시 `.error` 클래스 제거
- [ ] 에러 메시지가 재시도 횟수 포함 (예: "3회 시도 후 실패")
- [ ] `npm run build` 성공

**Agent-Executed QA Scenarios**:

```
Scenario: Error class is applied on sync failure
  Tool: Playwright (playwright skill)
  Preconditions: Dev server running, Gmail connected, network error simulated
  Steps:
    1. Navigate to: linear-capture://settings (앱 설정 창)
    2. Wait for: #syncGmailBtn visible
    3. Note: 실제 에러 시뮬레이션은 mock 또는 network 차단 필요
    4. For build verification: npm run build && grep "classList.add.*error" src/renderer/settings.html
    5. Assert: error class handling code exists
  Expected Result: Error handling code present
  Evidence: grep output captured

Scenario: Build succeeds with UI changes
  Tool: Bash
  Preconditions: Task 3 code written
  Steps:
    1. npm run build
    2. Assert: exit code 0
  Expected Result: Build completes without errors
  Evidence: Build output captured
```

**Commit**: YES
- Message: `feat(settings): display sync error with retry count in UI`
- Files: `src/renderer/settings.html`, `locales/*/translation.json` (if i18n added)
- Pre-commit: `npm run build`

---

### Task 4: Add Unit Tests for Retry Logic

**What to do**:
- `src/services/__tests__/gmail-sync.test.ts` 파일 생성
- `slack-sync.test.ts` 패턴 참고하여 테스트 구조 작성
- 테스트 케이스:
  1. Happy path: sync 성공
  2. Network error: 3회 재시도 후 실패
  3. Auth error (401): 즉시 실패, 재시도 없음
  4. Rate limit (429): 재시도 with 백오프
  5. Partial success: 일부 배치 성공, 커서 저장

**Must NOT do**:
- 다른 테스트 파일 수정하지 않음
- E2E 테스트 작성하지 않음

**Recommended Agent Profile**:
- **Category**: `unspecified-low`
  - Reason: 테스트 파일 작성, 기존 패턴 참고
- **Skills**: [`git-master`]

**Parallelization**:
- **Can Run In Parallel**: NO
- **Parallel Group**: Sequential (final)
- **Blocks**: None
- **Blocked By**: Task 3

**References**:
- `src/services/__tests__/slack-sync.test.ts` - 테스트 패턴 및 mock 구조
- `src/services/__tests__/context-adapters.test.ts:3-4` - GmailAdapter mock 패턴
- `src/services/sync-adapters/gmail-sync.ts` - 테스트 대상

**Acceptance Criteria**:

- [ ] `src/services/__tests__/gmail-sync.test.ts` 파일 생성
- [ ] 최소 5개 테스트 케이스 포함
- [ ] `npm run test -- src/services/__tests__/gmail-sync.test.ts` 통과
- [ ] Mock으로 gmail-client, embedding-service 대체
- [ ] 재시도 로직 검증 (retry count, backoff timing)

**Agent-Executed QA Scenarios**:

```
Scenario: All Gmail sync tests pass
  Tool: Bash
  Preconditions: Test file created
  Steps:
    1. npm run test -- src/services/__tests__/gmail-sync.test.ts
    2. Assert: exit code 0
    3. Assert: output contains "5 passed" or similar
  Expected Result: All tests pass
  Evidence: Test output captured

Scenario: Test covers retry logic
  Tool: Bash
  Preconditions: Test file created
  Steps:
    1. grep -c "retry" src/services/__tests__/gmail-sync.test.ts
    2. Assert: count >= 2 (retry mentioned in at least 2 tests)
    3. grep "toHaveBeenCalledTimes" src/services/__tests__/gmail-sync.test.ts
    4. Assert: retry call count verification exists
  Expected Result: Retry logic is tested
  Evidence: grep output captured
```

**Commit**: YES
- Message: `test(gmail-sync): add unit tests for retry logic`
- Files: `src/services/__tests__/gmail-sync.test.ts`
- Pre-commit: `npm run test`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `perf(gmail-sync): tune batch constants for faster sync` | gmail-sync.ts | npm run build |
| 2 | `feat(gmail-sync): add retry logic with exponential backoff` | gmail-sync.ts | npm run build |
| 3 | `feat(settings): display sync error with retry count in UI` | settings.html, locales/* | npm run build |
| 4 | `test(gmail-sync): add unit tests for retry logic` | gmail-sync.test.ts | npm run test |

---

## Success Criteria

### Verification Commands
```bash
# Build succeeds
npm run build
# Expected: exit code 0

# All tests pass
npm run test
# Expected: All tests pass including new gmail-sync tests

# Constants changed
grep -E "BATCH_SIZE|BATCH_DELAY_MS" src/services/sync-adapters/gmail-sync.ts
# Expected: BATCH_SIZE = 150, BATCH_DELAY_MS = 200

# Retry function exists
grep "retryWithBackoff" src/services/sync-adapters/gmail-sync.ts
# Expected: Function definition found

# Error handling in UI
grep "error.*class" src/renderer/settings.html | grep -i gmail
# Expected: Error class handling for Gmail sync
```

### Final Checklist
- [ ] 배치 상수 변경됨 (BATCH_SIZE=150, BATCH_DELAY_MS=200)
- [ ] 재시도 로직 추가됨 (3회, 지수 백오프)
- [ ] UI에 에러 표시됨
- [ ] 유닛 테스트 통과
- [ ] 빌드 성공
