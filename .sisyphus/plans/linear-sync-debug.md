# Linear 동기화 디버깅 & 수정

## TL;DR

> **Quick Summary**: Linear 이슈 동기화가 1000+개 중 242개만 완료되는 문제 해결 + 패키징 앱의 터미널 로그 미출력 문제 해결. 로그 문제를 먼저 해결하고, 그 로그를 활용해 동기화 문제를 진단 후 수정하는 2단계 접근.
> 
> **Deliverables**:
> - `pack:debug` npm 스크립트 추가 (터미널 로그 출력)
> - `linear-sync.ts` 페이지네이션 에러 핸들링 강화
> - 동기화 커서 관리 로직 개선 (불완전 동기화 시 커서 미갱신)
> - 진단 로깅 추가
> 
> **Estimated Effort**: Medium (3-4 tasks)
> **Parallel Execution**: NO — Phase 1 → Phase 2 순차 실행 (로그 해결이 동기화 디버깅의 전제)
> **Critical Path**: Task 1 (로그) → Task 2 (진단) → Task 3 (수정) → Task 4 (검증)

---

## Context

### Original Request
"현재 이런 상황인데 실제로 리니어 이슈가 제대로 동기화되었는지 확인이 필요해."
- Settings 동기화 패널에서 Linear 이슈가 242개만 표시됨 (실제 1000+개)
- 터미널에서 로그가 안 보여서 디버깅이 불가능

### Interview Summary
**Key Discussions**:
- 242개 이슈는 Settings > Integrations 동기화 상태에서 확인됨
- 실제 Linear 워크스페이스에는 1000+개 이슈 존재
- 로컬 캐시 우선 읽기는 이미 아카이브됨, API-only 방식으로 복원 완료
- `npm run pack:clean`만 테스트 허용

**Research Findings**:
- Linear SDK 기본 페이지 크기: 50, 최대 100
- `linear-sync.ts`의 `fetchAllIssues()`는 코드상 올바른 페이지네이션 보유 (while hasNextPage + fetchNext)
- `linear-client.ts`의 메타데이터 API (getTeams, getProjects 등)는 페이지네이션 없음 — 그러나 이건 이슈 수와 무관
- `linear-sync.ts`는 `console.log` 사용 (logger.log 아님) — isDev 제한 대상 아님
- `pack:clean`의 `open` 명령이 stdout을 터미널에 연결하지 않아 모든 로그 미출력

### Metis Review
**Identified Gaps** (addressed):
- **커서 문제**: incremental sync에서 부분 성공 시에도 커서를 최신으로 갱신 → 나머지 이슈 영원히 미동기화 → Task 3에서 수정
- **fetchNext() 에러 미처리**: pagination loop에서 try/catch 없음 → 에러 시 부분 결과만 반환 → Task 3에서 수정
- **embedding 실패 시 빈 벡터 반환**: PGlite에 빈 벡터 저장 가능성 → 범위 제한, 이번 플랜에서는 진단만 (OUT OF SCOPE)
- **`open` vs 직접 실행**: `pack:debug` 스크립트로 해결 → Task 1

---

## Work Objectives

### Core Objective
Linear 이슈 동기화가 전체 이슈를 가져오도록 수정하고, 디버깅을 위한 터미널 로그 출력 환경을 구축한다.

### Concrete Deliverables
- `package.json`에 `pack:debug` 스크립트 추가
- `linear-sync.ts`에 진단 로깅 + 에러 핸들링 강화
- 동기화 커서 관리 로직 개선

### Definition of Done
- [ ] `npm run pack:debug`로 앱 실행 시 터미널에 `[LinearSync]` 로그 출력됨
- [ ] Settings > Integrations에서 Linear 동기화 시 242개 이상의 이슈가 동기화됨
- [ ] 동기화 중 에러 발생 시 커서가 갱신되지 않아 재시도 가능

### Must Have
- 터미널에서 로그를 볼 수 있는 방법
- 페이지네이션 루프의 에러 핸들링
- 불완전 동기화 시 커서 보호

### Must NOT Have (Guardrails)
- `linear-client.ts`의 인터페이스(TeamInfo, ProjectInfo 등) 수정 금지
- 쓰기 기능(createIssue, searchIssues) 영향 금지
- `embedding-client.ts` 아키텍처 변경 금지 (빈 벡터 문제는 별도 이슈)
- Settings UI(settings.html) 변경 금지
- `getSyncStatus()` 쿼리 로직 변경 금지
- `pack:clean` 스크립트 동작 변경 금지 (별도 `pack:debug` 추가)
- `npm start` 개발 모드 사용 금지 — 테스트는 `npm run pack:clean`
- IndexedDB 로컬 캐시 재시도 금지
- 기본값 추정 금지

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: NO (이번 작업은 런타임 환경 의존적 디버깅/수정이라 unit test 부적합)
- **Framework**: vitest (기존 테스트 유지만, 새 테스트 미작성)

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

모든 검증은 `npm run pack:clean` 빌드 후 에이전트가 직접 실행.

---

## Execution Strategy

### Dependency Chain (Sequential)

```
Task 1: pack:debug 스크립트 추가
    ↓
Task 2: 동기화 진단 로깅 추가 + fetchAllIssues 에러 핸들링
    ↓
Task 3: 동기화 커서 보호 로직 개선
    ↓
Task 4: 통합 빌드 + 검증
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2, 3, 4 | None |
| 2 | 1 (로그로 검증) | 3, 4 | None |
| 3 | 2 (진단 결과 기반) | 4 | None |
| 4 | 1, 2, 3 | None | None (final) |

---

## TODOs

- [ ] 1. `pack:debug` npm 스크립트 추가

  **What to do**:
  - `package.json`의 `scripts`에 `pack:debug` 추가
  - 스크립트 내용: `npm run build && electron-builder --dir && LINEAR_CAPTURE_DEBUG=1 './release/mac-arm64/Linear Capture.app/Contents/MacOS/Linear Capture'`
  - `open` 명령 대신 바이너리 직접 실행하여 stdout/stderr가 터미널에 출력되도록 함
  - `LINEAR_CAPTURE_DEBUG=1` 환경변수를 프로세스에 직접 전달

  **Must NOT do**:
  - `pack:clean` 스크립트를 수정하지 않음 (기존 워크플로우 유지)
  - logger.ts의 isDev 로직을 변경하지 않음

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: package.json에 한 줄 추가하는 단순 작업
  - **Skills**: [`git-master`]
    - `git-master`: 작은 변경사항 커밋에 적합

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Task 1)
  - **Blocks**: Tasks 2, 3, 4
  - **Blocked By**: None

  **References**:

  **Pattern References** (existing code to follow):
  - `package.json:17` — `pack:clean` 스크립트 패턴 (동일한 빌드 → 실행 구조 따라감)
  - `package.json:15` — `pack` 스크립트 (electron-builder --dir 사용)

  **API/Type References**:
  - `src/services/utils/logger.ts:13` — `LINEAR_CAPTURE_DEBUG` 환경변수가 `isDev` 평가에 사용됨

  **WHY Each Reference Matters**:
  - `pack:clean`의 패턴을 따르되, `open` 대신 직접 바이너리 실행으로 변경
  - `logger.ts`에서 `LINEAR_CAPTURE_DEBUG`가 어떻게 사용되는지 확인하여 환경변수 전달 보장

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: pack:debug 스크립트가 package.json에 존재
    Tool: Bash (grep)
    Preconditions: package.json 파일 존재
    Steps:
      1. grep "pack:debug" package.json
      2. Assert: 출력에 "pack:debug" 키가 포함됨
      3. Assert: 출력에 "Linear Capture.app/Contents/MacOS/Linear Capture" 경로 포함
      4. Assert: 출력에 "LINEAR_CAPTURE_DEBUG" 포함
    Expected Result: pack:debug 스크립트가 올바르게 정의됨
    Evidence: grep 출력

  Scenario: TypeScript 컴파일 성공
    Tool: Bash
    Preconditions: None
    Steps:
      1. npx tsc --noEmit
      2. Assert: exit code 0
    Expected Result: 컴파일 에러 없음
    Evidence: 명령어 exit code
  ```

  **Commit**: YES
  - Message: `fix(dev): add pack:debug script for terminal log visibility`
  - Files: `package.json`
  - Pre-commit: `npx tsc --noEmit`

---

- [ ] 2. 동기화 진단 로깅 + fetchAllIssues 에러 핸들링

  **What to do**:
  - `linear-sync.ts`의 `fetchAllIssues()` 메서드 (line 190-201)에 다음 추가:
    1. 페이지네이션 루프에서 **각 페이지별 누적 카운트 로그** 추가 (기존 line 196 보강)
    2. `connection.fetchNext()` 호출을 **try/catch로 감싸기** — 에러 시 현재까지 수집된 결과 반환 + 에러 로그
    3. 루프 종료 후 **총 페이지 수 + 총 이슈 수 로그** 추가
  - `syncIncremental()` 메서드에 **커서 값 + 필터 로그** 추가 (현재 cursor 값이 무엇인지 확인용)
  - `processBatch()` 메서드에 **embedding 실패 카운트 로그** 추가 (빈 벡터 반환 감지용)

  **Must NOT do**:
  - `fetchAllIssues`의 함수 시그니처 변경 금지
  - `processBatch`의 핵심 로직 변경 금지
  - `embedding-client.ts` 수정 금지
  - 기존 `console.log` 패턴 유지 (`logger.log` 아닌 `console.log` 사용 — 항상 출력)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 기존 메서드에 로깅과 try/catch 추가하는 단순 작업
  - **Skills**: [`git-master`]
    - `git-master`: 변경사항 커밋

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Task 2)
  - **Blocks**: Tasks 3, 4
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/services/sync-adapters/linear-sync.ts:190-201` — `fetchAllIssues()` 메서드 (현재 구현, 수정 대상)
  - `src/services/sync-adapters/linear-sync.ts:117-188` — `syncIncremental()` (커서 로깅 추가 대상)
  - `src/services/sync-adapters/linear-sync.ts:204-220` — `processBatch()` (embedding 실패 감지 로깅 대상)
  - `src/services/sync-adapters/linear-sync.ts:60` — 기존 `console.log('[LinearSync]...')` 패턴 (동일하게 사용)

  **Test References**:
  - `src/services/sync-adapters/__tests__/linear-sync.test.ts` — 기존 테스트 (fetchNext mock 있음, 깨지지 않도록 주의)

  **WHY Each Reference Matters**:
  - `fetchAllIssues:190-201`이 정확한 수정 위치. try/catch 추가 시 기존 allNodes 반환 구조 유지 필요
  - 기존 테스트의 `fetchNext: vi.fn()` mock이 있으므로, try/catch 추가해도 테스트 통과 확인 필요
  - `console.log` 패턴 유지 — `logger.log`는 packaged app에서 기본 suppressed

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: TypeScript 컴파일 성공
    Tool: Bash
    Preconditions: None
    Steps:
      1. npx tsc --noEmit
      2. Assert: exit code 0
    Expected Result: 타입 에러 없음
    Evidence: exit code

  Scenario: 기존 linear-sync 테스트 통과
    Tool: Bash
    Preconditions: None
    Steps:
      1. npx vitest run src/services/sync-adapters/__tests__/linear-sync.test.ts
      2. Assert: 모든 테스트 PASS
    Expected Result: 기존 테스트가 새 로깅/try-catch로 인해 깨지지 않음
    Evidence: vitest 출력

  Scenario: fetchAllIssues에 try/catch 존재 확인
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. grep -A 5 "fetchNext" src/services/sync-adapters/linear-sync.ts
      2. Assert: 출력에 "try" 또는 "catch" 포함
    Expected Result: fetchNext 호출이 에러 핸들링으로 감싸져 있음
    Evidence: grep 출력

  Scenario: 페이지네이션 진단 로그 존재 확인
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. grep "total.*page\|page.*count\|pages fetched\|Total issues" src/services/sync-adapters/linear-sync.ts
      2. Assert: 최소 1개 이상 매칭
    Expected Result: 페이지네이션 진단 로그가 추가됨
    Evidence: grep 출력
  ```

  **Commit**: YES
  - Message: `fix(sync): add error handling and diagnostic logging to Linear sync pagination`
  - Files: `src/services/sync-adapters/linear-sync.ts`
  - Pre-commit: `npx vitest run src/services/sync-adapters/__tests__/linear-sync.test.ts`

---

- [ ] 3. 동기화 커서 보호 로직 개선

  **What to do**:
  - `linear-sync.ts`의 `syncIncremental()` 메서드 (line 117-188)에서 커서 갱신 조건 강화:
    1. **현재 문제**: line 168에서 `latestUpdatedAt !== lastCursor`이면 커서 갱신 → 부분 성공이어도 커서가 전진
    2. **수정**: 전체 fetch된 이슈 수 대비 성공 비율 확인 → 예: 전체 1000개 중 242개만 성공이면 커서 미갱신
    3. **구체적 로직**: `result.itemsFailed`가 0이 아니거나, `result.itemsSynced`가 총 fetch 수의 80% 미만이면 커서를 갱신하지 않고 경고 로그 출력
  - `sync()` (full sync) 메서드 (line 59-115)에도 동일한 커서 보호 적용

  **Must NOT do**:
  - `updateSyncCursor()` 메서드 자체 변경 금지 — 호출 조건만 변경
  - `updateSyncStatus()` 변경 금지
  - `processBatch()` 로직 변경 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 조건문 추가 수준의 단순 수정
  - **Skills**: [`git-master`]
    - `git-master`: 커밋 관리

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Task 3)
  - **Blocks**: Task 4
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `src/services/sync-adapters/linear-sync.ts:117-188` — `syncIncremental()` 전체 (커서 갱신 로직 위치)
  - `src/services/sync-adapters/linear-sync.ts:168-171` — 현재 커서 갱신 조건 (수정 대상)
  - `src/services/sync-adapters/linear-sync.ts:97-100` — `sync()` full sync의 커서 갱신 (동일 수정 대상)
  - `src/services/sync-adapters/linear-sync.ts:144` — `allIssues.length` (총 fetch 수, 비율 계산에 사용)

  **Test References**:
  - `src/services/sync-adapters/__tests__/linear-sync.test.ts` — 기존 테스트 (커서 관련 동작 포함 여부 확인 필요)

  **WHY Each Reference Matters**:
  - `line 168-171`이 정확한 수정 위치. 조건문에 totalFetched 대비 itemsSynced 비율 검사 추가
  - `line 144`의 `allIssues.length`를 `syncIncremental` 스코프에서 접근하여 비율 계산
  - 기존 테스트가 커서 갱신을 mock하고 있을 수 있으므로 확인 필요

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: TypeScript 컴파일 성공
    Tool: Bash
    Preconditions: None
    Steps:
      1. npx tsc --noEmit
      2. Assert: exit code 0
    Expected Result: 타입 에러 없음
    Evidence: exit code

  Scenario: 기존 linear-sync 테스트 통과
    Tool: Bash
    Preconditions: None
    Steps:
      1. npx vitest run src/services/sync-adapters/__tests__/linear-sync.test.ts
      2. Assert: 모든 테스트 PASS
    Expected Result: 커서 보호 로직 추가가 기존 테스트를 깨지 않음
    Evidence: vitest 출력

  Scenario: 커서 보호 조건 존재 확인
    Tool: Bash (grep)
    Preconditions: None
    Steps:
      1. grep -n "itemsSynced\|itemsFailed\|cursor.*skip\|skip.*cursor\|not advancing\|80" src/services/sync-adapters/linear-sync.ts
      2. Assert: syncIncremental 메서드 범위에서 비율 검사 또는 조건부 커서 갱신 로직 확인
    Expected Result: 커서 갱신에 성공 비율 조건이 추가됨
    Evidence: grep 출력
  ```

  **Commit**: YES
  - Message: `fix(sync): protect sync cursor from advancing on incomplete sync`
  - Files: `src/services/sync-adapters/linear-sync.ts`
  - Pre-commit: `npx vitest run src/services/sync-adapters/__tests__/linear-sync.test.ts`

---

- [ ] 4. 통합 빌드 + 검증 (커서 리셋 + 전체 재동기화)

  **What to do**:
  - `npm run pack:clean`으로 전체 빌드 + 패키징
  - 빌드 성공 확인
  - 앱 실행 후 DevTools 콘솔에서:
    1. `await window.electronAPI.invoke('sync:reset-cursor', 'linear')` — 기존 커서 리셋
    2. `await window.electronAPI.invoke('sync:delete-source', 'linear')` — 기존 동기화 데이터 삭제
    3. Settings > Integrations에서 Linear "Sync Now" 클릭
    4. 동기화 완료 후 문서 수 확인: `await window.electronAPI.invoke('sync:get-status')`
  - `npm run pack:debug`로 실행하여 터미널에서 `[LinearSync]` 로그 출력 확인

  **Must NOT do**:
  - `npm start`로 테스트 금지
  - 소스 코드 추가 수정 금지 (빌드 + 검증만)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 빌드 + 수동 검증 절차
  - **Skills**: [`git-master`]
    - `git-master`: 최종 커밋 정리

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Task 4, final)
  - **Blocks**: None
  - **Blocked By**: Tasks 1, 2, 3

  **References**:

  **Pattern References**:
  - `package.json:17` — `pack:clean` 스크립트 (빌드 + 실행 명령)
  - `src/main/ipc-handlers.ts:849-868` — `sync:reset-cursor` IPC 핸들러 (기존 커서 리셋 기능)
  - `src/main/ipc-handlers.ts:870-893` — `sync:delete-source` IPC 핸들러 (기존 데이터 삭제 기능)

  **WHY Each Reference Matters**:
  - `pack:clean`으로 빌드 후 실제 앱에서 동기화 동작 확인
  - `sync:reset-cursor`와 `sync:delete-source`는 이미 구현된 IPC — 별도 개발 불필요, 검증에 활용

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: npm run pack:clean 빌드 성공
    Tool: Bash
    Preconditions: Tasks 1-3 완료
    Steps:
      1. npm run pack:clean
      2. Assert: exit code 0
      3. Assert: release/mac-arm64/Linear Capture.app 디렉토리 존재
    Expected Result: 패키징 성공, 앱 실행
    Evidence: 파일 존재 확인

  Scenario: pack:debug로 터미널 로그 출력 확인
    Tool: Bash
    Preconditions: 빌드 완료
    Steps:
      1. npm run build && electron-builder --dir
      2. LINEAR_CAPTURE_DEBUG=1 timeout 15 './release/mac-arm64/Linear Capture.app/Contents/MacOS/Linear Capture' 2>&1 | head -30
      3. Assert: 출력에 로그 라인이 포함됨 (e.g., "Loaded:" 또는 "[App]" 또는 "[LocalCache]")
    Expected Result: 터미널에 앱 로그가 출력됨
    Evidence: stdout 캡처
  ```

  **Commit**: NO (검증만, 코드 변경 없음)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `fix(dev): add pack:debug script for terminal log visibility` | package.json | `npx tsc --noEmit` |
| 2 | `fix(sync): add error handling and diagnostic logging to Linear sync pagination` | src/services/sync-adapters/linear-sync.ts | `npx vitest run src/services/sync-adapters/__tests__/linear-sync.test.ts` |
| 3 | `fix(sync): protect sync cursor from advancing on incomplete sync` | src/services/sync-adapters/linear-sync.ts | `npx vitest run src/services/sync-adapters/__tests__/linear-sync.test.ts` |
| 4 | (No commit — verification only) | — | `npm run pack:clean` |

---

## Success Criteria

### Verification Commands
```bash
npx tsc --noEmit                    # Expected: exit code 0
npx vitest run                      # Expected: 기존 테스트 모두 PASS (pre-existing failures만)
npm run pack:clean                  # Expected: 빌드 + 패키징 성공
grep "pack:debug" package.json      # Expected: 스크립트 존재
```

### Final Checklist
- [ ] `pack:debug` 스크립트 존재하고 바이너리 직접 실행
- [ ] `fetchAllIssues()` 에러 핸들링 (try/catch) 추가됨
- [ ] 진단 로깅 (페이지 수, 총 이슈 수, 커서 값) 추가됨
- [ ] 커서 보호 로직 (불완전 동기화 시 미갱신) 추가됨
- [ ] 기존 테스트 전부 통과
- [ ] `npm run pack:clean` 빌드 성공
- [ ] All "Must NOT Have" absent
