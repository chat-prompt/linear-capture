# Worker Indexing 호출 추가

## TL;DR

> **Quick Summary**: Gmail, Notion, Slack, Linear 4개 소스를 Worker Vectorize에 인덱싱하여 AI 추천(`/ai/recommend`)에서 검색 가능하게 함
> 
> **Deliverables**:
> - `src/services/worker-indexing.ts` - Worker 인덱싱 서비스 (~50줄)
> - `src/__tests__/worker-indexing.test.ts` - TDD 테스트
> - `src/main/index.ts` - 4개 호출 지점 추가
> 
> **Estimated Effort**: Short (2-3시간)
> **Parallel Execution**: NO - sequential (의존성 있음)
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4

---

## Context

### Original Request
AI 추천 컨텐츠에 이메일이 안 뜨는 문제 해결 → Worker Vectorize 인덱싱 호출 추가

### Interview Summary
**Key Discussions**:
- **범위**: Gmail, Notion, Slack, Linear 4개 모두 Worker 인덱싱 추가
- **시점**: OAuth 완료 시 + 앱 시작 시 (Linear은 토큰 저장 시 + 앱 시작 시)
- **테스트**: TDD 방식
- **로컬 Slack sync**: 별개 시스템으로 유지

**Research Findings**:
- Worker 엔드포인트: `POST /index/gmail?device_id=...`, `/index/notion`, `/index/slack`, `/index/linear`
- 응답 형식: `{ success: boolean, indexed?: number, error?: string }`
- 기존 패턴: `ai-recommend.ts`의 Worker 호출 방식 참조
- OAuth 콜백: `handleDeepLink()` 함수 (main/index.ts:74-191)
- 앱 시작: `app.whenReady()` 이후 (main/index.ts:1348-1364)

### Metis Review
**Identified Gaps** (addressed):
- Linear OAuth 없음 → 토큰 저장 시 + 앱 시작 시 인덱싱으로 해결
- Worker endpoint contract 확인 → POST method, device_id query param 확인됨
- 인덱싱 실패 처리 → 조용히 실패 + 로그 (fire-and-forget)

---

## Work Objectives

### Core Objective
Worker Vectorize에 4개 소스 데이터를 인덱싱하여 AI 추천에서 검색 가능하게 함

### Concrete Deliverables
- `src/services/worker-indexing.ts` - `indexToWorker()` 함수
- `src/__tests__/worker-indexing.test.ts` - 테스트 파일
- OAuth 콜백에 인덱싱 호출 추가 (Gmail, Notion, Slack)
- 앱 시작 시 인덱싱 호출 추가 (4개 소스)
- Linear 토큰 저장 시 인덱싱 호출 추가

### Definition of Done
- [ ] `npm test` 통과
- [ ] OAuth 완료 시 인덱싱 로그 출력 확인
- [ ] 앱 시작 시 인덱싱 로그 출력 확인
- [ ] `/ai/recommend` 호출 시 인덱싱된 데이터 검색됨

### Must Have
- `indexToWorker(source)` 함수
- Gmail, Notion, Slack OAuth 완료 시 호출
- 앱 시작 시 연결된 서비스 인덱싱
- Linear 토큰 저장 시 호출
- 비동기 fire-and-forget (UI 블로킹 없음)

### Must NOT Have (Guardrails)
- 별도 sync 클래스 생성 (Worker가 처리)
- 인덱싱 상태 UI (불필요한 복잡도)
- 기존 `SlackSync`, `LocalVectorStore` 수정 (별개 시스템)
- 재시도 로직 (Worker가 처리)
- OAuth 완료를 인덱싱 결과에 블로킹
- 증분/커서 기반 sync 로직 (Worker 책임)

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.

### Test Decision
- **Infrastructure exists**: YES (`src/__tests__/`)
- **Automated tests**: TDD
- **Framework**: vitest

### If TDD Enabled

Each TODO follows RED-GREEN-REFACTOR:

**Task Structure:**
1. **RED**: Write failing test first
2. **GREEN**: Implement minimum code to pass
3. **REFACTOR**: Clean up while keeping green

### Agent-Executed QA Scenarios (MANDATORY)

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| **Unit Tests** | Bash (`npm test`) | Run tests, assert pass |
| **Integration** | Bash (`curl`) | Call Worker endpoint, assert response |
| **App Behavior** | Console logs | Verify indexing calls in logs |

---

## Execution Strategy

### Sequential Execution

```
Task 1: 테스트 작성 (RED)
    ↓
Task 2: worker-indexing.ts 구현 (GREEN)
    ↓
Task 3: OAuth 콜백에 호출 추가
    ↓
Task 4: 앱 시작 + Linear 토큰 저장 시 호출 추가
    ↓
Task 5: 통합 테스트 (REFACTOR)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|------------|--------|
| 1 | None | 2 |
| 2 | 1 | 3, 4 |
| 3 | 2 | 5 |
| 4 | 2 | 5 |
| 5 | 3, 4 | None |

---

## TODOs

- [ ] 1. TDD: 테스트 파일 작성 (RED)

  **What to do**:
  - `src/__tests__/worker-indexing.test.ts` 생성
  - `indexToWorker()` 함수 테스트 케이스 작성
  - 각 소스(gmail, notion, slack, linear)에 대한 테스트
  - 성공/실패 케이스 모두 커버
  - fetch mock 사용

  **Must NOT do**:
  - 실제 Worker 호출 (mock 사용)
  - 복잡한 재시도 로직 테스트

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/__tests__/analyzer.test.ts` - Worker 호출 테스트 패턴
  - `src/services/__tests__/slack-sync.test.ts:33-40` - fetch mock 패턴

  **API/Type References**:
  - `src/services/ai-recommend.ts:12-17` - RecommendResult 타입 참조

  **Acceptance Criteria**:

  - [ ] 테스트 파일 생성: `src/__tests__/worker-indexing.test.ts`
  - [ ] `npm test src/__tests__/worker-indexing.test.ts` → FAIL (구현 없음)
  - [ ] 4개 소스 각각에 대한 테스트 케이스 존재

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Test file exists and fails correctly
    Tool: Bash
    Preconditions: None
    Steps:
      1. ls src/__tests__/worker-indexing.test.ts
      2. npm test src/__tests__/worker-indexing.test.ts 2>&1 || true
      3. Assert: exit code is non-zero (test fails because no implementation)
    Expected Result: Test file exists, tests fail
    Evidence: Command output captured
  ```

  **Commit**: YES
  - Message: `test(worker-indexing): add failing tests for Worker indexing service`
  - Files: `src/__tests__/worker-indexing.test.ts`

---

- [ ] 2. TDD: worker-indexing.ts 구현 (GREEN)

  **What to do**:
  - `src/services/worker-indexing.ts` 생성
  - `indexToWorker(source: IndexSource): Promise<IndexResult>` 함수 구현
  - Worker `/index/{source}?device_id=...` 엔드포인트 호출
  - 에러 처리 (조용히 실패 + 로그)

  **Must NOT do**:
  - 재시도 로직 추가
  - 복잡한 에러 처리
  - UI 알림

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/services/ai-recommend.ts:19-41` - Worker fetch 패턴 (동일 구조)
  - `src/services/settings-store.ts:getDeviceId()` - device_id 획득 방법

  **API/Type References**:
  - Worker endpoint: `POST https://linear-capture-ai.ny-4f1.workers.dev/index/{source}?device_id={deviceId}`
  - Response: `{ success: boolean, indexed?: number, error?: string }`

  **Acceptance Criteria**:

  - [ ] 파일 생성: `src/services/worker-indexing.ts`
  - [ ] `npm test src/__tests__/worker-indexing.test.ts` → PASS
  - [ ] `indexToWorker('gmail')` 함수 존재 및 동작

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Tests pass after implementation
    Tool: Bash
    Preconditions: Task 1 완료
    Steps:
      1. ls src/services/worker-indexing.ts
      2. npm test src/__tests__/worker-indexing.test.ts
      3. Assert: exit code is 0
    Expected Result: All tests pass
    Evidence: Test output captured
  ```

  **Commit**: YES
  - Message: `feat(worker-indexing): implement Worker indexing service`
  - Files: `src/services/worker-indexing.ts`

---

- [ ] 3. OAuth 콜백에 인덱싱 호출 추가

  **What to do**:
  - `handleDeepLink()` 함수에서 Gmail OAuth 완료 후 `indexToWorker('gmail')` 호출
  - Notion OAuth 완료 후 `indexToWorker('notion')` 호출
  - Slack OAuth 완료 후 `indexToWorker('slack')` 호출
  - fire-and-forget 방식 (`.catch(console.error)`)

  **Must NOT do**:
  - OAuth 완료를 인덱싱 결과에 블로킹
  - 기존 로직 변경 (추가만)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 5
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `src/main/index.ts:99-103` - Slack OAuth 완료 후 sync 호출 패턴
  - `src/main/index.ts:123-140` - Notion OAuth 콜백 위치
  - `src/main/index.ts:150-170` - Gmail OAuth 콜백 위치

  **Acceptance Criteria**:

  - [ ] Gmail OAuth 콜백에 `indexToWorker('gmail')` 호출 추가
  - [ ] Notion OAuth 콜백에 `indexToWorker('notion')` 호출 추가
  - [ ] Slack OAuth 콜백에 `indexToWorker('slack')` 호출 추가
  - [ ] 모든 호출이 `.catch(console.error)` 또는 fire-and-forget 방식

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Indexing calls exist in OAuth callbacks
    Tool: Bash (grep)
    Preconditions: Task 2 완료
    Steps:
      1. grep -n "indexToWorker.*gmail" src/main/index.ts
      2. grep -n "indexToWorker.*notion" src/main/index.ts
      3. grep -n "indexToWorker.*slack" src/main/index.ts
      4. Assert: All 3 grep commands find matches
    Expected Result: All indexing calls present
    Evidence: grep output captured
  ```

  **Commit**: YES
  - Message: `feat(indexing): add Worker indexing calls on OAuth completion`
  - Files: `src/main/index.ts`

---

- [ ] 4. 앱 시작 + Linear 토큰 저장 시 인덱싱 호출 추가

  **What to do**:
  - 앱 시작 시 (`app.whenReady()` 이후) 연결된 서비스 확인 후 인덱싱
  - Linear 토큰 저장 시 (`save-settings` IPC 핸들러) `indexToWorker('linear')` 호출
  - `Promise.allSettled()` 사용하여 병렬 실행, 비블로킹

  **Must NOT do**:
  - 앱 시작을 인덱싱 완료에 블로킹
  - 연결 안 된 서비스 인덱싱 시도

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 5
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `src/main/index.ts:1348-1364` - 앱 시작 후 백그라운드 작업 패턴
  - `src/main/index.ts:806-830` - save-settings IPC 핸들러 위치

  **API References**:
  - `gmail-status`, `notion-status`, `slack-status` IPC로 연결 상태 확인

  **Acceptance Criteria**:

  - [ ] 앱 시작 시 인덱싱 호출 로직 추가 (연결된 서비스만)
  - [ ] Linear 토큰 저장 시 `indexToWorker('linear')` 호출 추가
  - [ ] `Promise.allSettled()` 사용 확인

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: App startup indexing logic exists
    Tool: Bash (grep)
    Preconditions: Task 2 완료
    Steps:
      1. grep -n "indexToWorker" src/main/index.ts | wc -l
      2. Assert: Count >= 5 (3 OAuth + 1 startup + 1 Linear save)
      3. grep -n "Promise.allSettled" src/main/index.ts
      4. Assert: Found
    Expected Result: All indexing calls present
    Evidence: grep output captured
  ```

  **Commit**: YES
  - Message: `feat(indexing): add Worker indexing on app startup and Linear token save`
  - Files: `src/main/index.ts`

---

- [ ] 5. 통합 테스트 및 REFACTOR

  **What to do**:
  - `npm run build` 성공 확인
  - `npm test` 전체 테스트 통과 확인
  - 코드 정리 (불필요한 로그 제거, 타입 정리)
  - `npm run pack:clean`으로 앱 실행하여 콘솔 로그 확인

  **Must NOT do**:
  - 기능 추가
  - 새로운 테스트 추가

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (final)
  - **Blocks**: None
  - **Blocked By**: Tasks 3, 4

  **References**:

  **Test Commands**:
  - `npm run build`
  - `npm test`

  **Acceptance Criteria**:

  - [ ] `npm run build` → 성공 (exit code 0)
  - [ ] `npm test` → 전체 테스트 통과
  - [ ] 타입 에러 없음

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Build and tests pass
    Tool: Bash
    Preconditions: Tasks 1-4 완료
    Steps:
      1. npm run build
      2. Assert: exit code 0
      3. npm test
      4. Assert: exit code 0, all tests pass
    Expected Result: Build succeeds, all tests pass
    Evidence: Command output captured

  Scenario: App runs and shows indexing logs
    Tool: Bash
    Preconditions: Build 성공
    Steps:
      1. npm run pack:clean 2>&1 | head -100
      2. Wait for app to start (5s)
      3. grep -i "indexing\|indexToWorker" in output
    Expected Result: Indexing log messages visible
    Evidence: Console output captured
  ```

  **Commit**: YES
  - Message: `refactor(indexing): clean up Worker indexing implementation`
  - Files: `src/services/worker-indexing.ts`, `src/main/index.ts`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `test(worker-indexing): add failing tests` | `*test.ts` | `npm test` fails |
| 2 | `feat(worker-indexing): implement service` | `worker-indexing.ts` | `npm test` passes |
| 3 | `feat(indexing): OAuth callbacks` | `index.ts` | grep confirms |
| 4 | `feat(indexing): app startup + Linear` | `index.ts` | grep confirms |
| 5 | `refactor(indexing): clean up` | multiple | `npm run build && npm test` |

---

## Success Criteria

### Verification Commands
```bash
# 빌드 확인
npm run build  # Expected: exit code 0

# 테스트 확인
npm test  # Expected: all tests pass

# 인덱싱 호출 확인
grep -c "indexToWorker" src/main/index.ts  # Expected: >= 5
grep -c "indexToWorker" src/services/worker-indexing.ts  # Expected: >= 1
```

### Final Checklist
- [ ] `worker-indexing.ts` 생성됨
- [ ] 테스트 파일 생성되고 통과함
- [ ] Gmail/Notion/Slack OAuth 콜백에 인덱싱 호출 있음
- [ ] 앱 시작 시 인덱싱 호출 있음
- [ ] Linear 토큰 저장 시 인덱싱 호출 있음
- [ ] 기존 `SlackSync`, `LocalVectorStore` 수정 안 함
- [ ] UI 변경 없음
