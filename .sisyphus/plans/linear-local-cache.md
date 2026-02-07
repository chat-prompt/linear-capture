# Linear 로컬 캐시 우선 읽기 (API 폴백)

## TL;DR

> **Quick Summary**: Linear Desktop App의 IndexedDB 로컬 캐시에서 읽기 데이터(teams, projects, users, states, cycles, labels)를 먼저 가져오고, 실패 시 기존 API로 폴백하는 구조로 전환. Notion 로컬 리더와 동일한 패턴.
> 
> **Deliverables**:
> - 확장된 Python 스크립트 (`export_linear_cache.py`) — 6종 데이터 전체 export
> - 확장된 TypeScript 서비스 (`linear-local-cache.ts`) — 전체 데이터 파싱 + 타입 매핑
> - 수정된 `loadLinearData()` — 로컬 우선, per-data-type API 폴백
> 
> **Estimated Effort**: Medium (4-6시간)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 0 (Discovery Gate) → Task 1 (Python) → Task 2 (TS) → Task 3 (Integration)

---

## Context

### Original Request
Linear API 호출 방식을 로컬 캐시(linear-mcp-fast 방식)로 대체하여 읽기 성능을 개선. Linear Desktop App이 설치된 사용자는 API 호출 없이 즉시 데이터 로드.

### Interview Summary
**Key Discussions**:
- 구현 방식: 기존 Python 스크립트(`export_linear_cache.py`) 확장
- 캐시 범위: 읽기 전부 로컬 우선, API 폴백 (Notion 패턴)
- 미설치 대응: 자동 감지 + 조용한 폴백 (사용자에게 별도 알림 없음)
- 테스트: Python 스크립트 단위 테스트 + pack:clean 수동 확인

**Research Findings**:
- `export_linear_cache.py`가 이미 4종(projects, teams, issues, states) 읽기 가능
- Linear IndexedDB 경로: `~/Library/Application Support/Linear/IndexedDB/https_linear.app_0.indexeddb.leveldb`
- `ccl_chromium_reader` (vendored)로 LevelDB 파싱
- 레코드 타입 감지는 heuristic 방식 (`is_*_record()` 함수)
- API는 filtered 데이터 반환 (active projects, non-past cycles), 로컬은 전체 데이터 → 필터링 필요

### Metis Review
**Identified Gaps** (addressed):
- **Users/Cycles/Labels가 IndexedDB에 존재하는지 미확인** → Phase 0 Discovery 게이트 추가
- **API 필터 불일치** → Python에서 active projects, non-past cycles 필터링
- **TeamInfo의 estimate 필드 누락 가능** → per-data-type fallback으로 대응
- **정렬 순서 차이** → TypeScript에서 API와 동일한 정렬 보장
- **Python 타임아웃 부족 가능** → 5s → 8s로 증가

---

## Work Objectives

### Core Objective
Linear Desktop App의 로컬 캐시를 활용하여 API 호출 없이 읽기 데이터를 즉시 로드하되, 실패 시 기존 API로 자연스럽게 폴백.

### Concrete Deliverables
- `scripts/export_linear_cache.py` — 6종 데이터 export (version 3 JSON)
- `src/services/linear-local-cache.ts` — 전체 데이터 파싱 + 타입 매핑
- `src/main/ipc-handlers.ts` — `loadLinearData()` 로컬 우선 로직

### Definition of Done
- [ ] `python3 scripts/export_linear_cache.py` 실행 시 6종 데이터 JSON 출력
- [ ] Linear Desktop 설치 환경: 앱 시작 시 로컬 캐시에서 데이터 로드 (API 호출 0)
- [ ] Linear Desktop 미설치 환경: 기존 API 방식으로 정상 동작
- [ ] TypeScript 컴파일 에러 없음 (`npx tsc --noEmit`)
- [ ] 기존 테스트 통과 (`npx vitest run`)

### Must Have
- 6종 데이터 모두 로컬 캐시 지원 (가능한 타입에 한해)
- per-data-type 폴백 (일부만 로컬에 있어도 활용)
- 기존 `TeamInfo`, `ProjectInfo` 등 인터페이스 변경 없음
- API 필터와 동일한 데이터 필터링 (active projects, non-past cycles)
- 기존 `createIssue`, `searchIssues` 등 쓰기 기능 영향 없음

### Must NOT Have (Guardrails)
- ❌ 새로운 UI 요소 추가 (캐시 상태 표시, 새로고침 버튼 등)
- ❌ 새로운 npm 의존성 추가
- ❌ `vendor/ccl_chromium_reader` 디렉토리 수정
- ❌ `linear-client.ts`의 기존 인터페이스 변경
- ❌ 쓰기 작업(createIssue, searchIssues, validateLinearToken) 수정
- ❌ Windows 지원 (이번 범위 외, macOS only)
- ❌ 데이터 신선도 체크 (이번 범위 외)
- ❌ Python 스크립트 아키텍처 리팩토링 (클래스 추출, 모듈 분리 등)
- ❌ Python 출력을 디스크에 캐싱 (매번 직접 IndexedDB 읽기)

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: YES (Tests-after) — Python 단위 테스트 + TS 컴파일 확인
- **Framework**: vitest (TS), pytest or direct execution (Python)

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| Python script | Bash | 실행 → JSON 출력 파싱 → 필드 검증 |
| TypeScript 서비스 | Bash (tsc) | 컴파일 → 에러 없음 확인 |
| 통합 | Bash (vitest) | 기존 테스트 + 신규 테스트 통과 |

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
└── Task 0: Discovery — IndexedDB 구조 탐색 (GATE)

Wave 2 (After Wave 1 passes gate):
└── Task 1: Python 스크립트 확장

Wave 3 (After Wave 2):
└── Task 2: TypeScript 서비스 확장

Wave 4 (After Wave 3):
└── Task 3: loadLinearData 통합

Critical Path: Task 0 → Task 1 → Task 2 → Task 3
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 0 | None | 1, 2, 3 (GATE) | None |
| 1 | 0 | 2, 3 | None |
| 2 | 1 | 3 | None |
| 3 | 2 | None | None |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 0 | delegate_task(category="quick") |
| 2 | 1 | delegate_task(category="unspecified-high") |
| 3 | 2 | delegate_task(category="unspecified-high") |
| 4 | 3 | delegate_task(category="unspecified-low") |

---

## TODOs

- [ ] 0. **[GATE] IndexedDB 구조 탐색 — Users, Cycles, Labels 존재 확인**

  **What to do**:
  - `export_linear_cache.py`에 `--discover` 플래그 추가
  - `--discover` 모드: 모든 object store 이름 + 각 store의 첫 번째 레코드 샘플 출력
  - 출력 형식: JSON `{"stores": [{"name": "store_name", "sample_keys": [...], "record_count_estimate": N}]}`
  - 실행하여 users, cycles, labels에 해당하는 store가 존재하는지 확인
  - **GATE CONDITION**: 각 타입별로 존재 여부를 기록. 존재하지 않는 타입은 Task 1에서 제외하고 해당 타입은 항상 API 폴백으로 처리

  **Must NOT do**:
  - 기존 `export_projects()` 로직 수정하지 않음
  - vendor 디렉토리 수정하지 않음

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단순 Python 코드 추가 + 실행 확인
  - **Skills**: [`git-master`]
    - `git-master`: 커밋 관리

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 1)
  - **Blocks**: Tasks 1, 2, 3
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `scripts/export_linear_cache.py:70-157` — `load_linear_data()` 함수. 여기서 object store 순회 패턴 참조. `for store_name in db.object_store_names` 루프가 핵심
  - `scripts/export_linear_cache.py:88` — `ccl_chromium_indexeddb.WrappedIndexDB(LINEAR_DB_PATH, LINEAR_BLOB_PATH)` DB 오픈 방법
  - `scripts/export_linear_cache.py:114-151` — store 순회 + record.value 접근 패턴

  **WHY Each Reference Matters**:
  - `load_linear_data()`: --discover 모드에서도 동일한 DB 오픈 + store 순회 패턴을 사용해야 함
  - 기존 heuristic 함수들: 어떤 필드로 레코드 타입을 구분하는지 패턴 참고

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Discovery flag outputs IndexedDB structure
    Tool: Bash
    Preconditions: Linear Desktop App installed, Python3 available
    Steps:
      1. python3 scripts/export_linear_cache.py --discover
      2. Parse stdout as JSON
      3. Assert: JSON has "stores" array
      4. Assert: Each store has "name" and "sample_keys"
      5. Log which stores contain user-like, cycle-like, label-like records
    Expected Result: JSON output with all object store info
    Evidence: stdout captured

  Scenario: Discovery works when Linear not installed
    Tool: Bash
    Preconditions: LINEAR_DB_PATH does not exist (or test with invalid path)
    Steps:
      1. python3 scripts/export_linear_cache.py --discover
      2. Assert: Exits with code 0
      3. Assert: stdout is valid JSON with empty stores
    Expected Result: Graceful empty output
    Evidence: stdout + exit code captured
  ```

  **Commit**: YES
  - Message: `feat(cache): add --discover flag to export_linear_cache.py for IndexedDB structure exploration`
  - Files: `scripts/export_linear_cache.py`
  - Pre-commit: `python3 scripts/export_linear_cache.py --discover`

---

- [ ] 1. **Python 스크립트 확장 — 6종 데이터 전체 export**

  **What to do**:
  - Task 0의 discovery 결과를 기반으로, 존재하는 데이터 타입에 대해:
  - `is_user_record()` 추가: `{"name", "email"}` 필드로 감지 (email이 있으면 user)
  - `is_cycle_record()` 추가: `{"number", "startsAt", "endsAt", "teamId"}` 필드로 감지
  - `is_label_record()` 추가: `{"name", "color"}` 필드로 감지 (color가 hex이면 label)
  - `load_linear_data()` 반환값 확장: `(projects, teams, issues, states)` → `(projects, teams, issues, states, users, cycles, labels)`
  - `export_projects()` → `export_all()`로 이름 변경 (기존 함수는 deprecated wrapper로 유지)
  - 출력 JSON version 3 구조:
    ```json
    {
      "version": 3,
      "updatedAt": "...",
      "teams": [{"id", "name", "key", ...}],
      "projects": [{"id", "name", "teamIds", "state/statusId", ...}],
      "users": [{"id", "name", "email", ...}],
      "states": [{"id", "name", "type", "color", "teamId"}],
      "cycles": [{"id", "name", "number", "startsAt", "endsAt", "teamId"}],
      "labels": [{"id", "name", "color", "teamId", "parentId"}],
      "issues": [{"id", "title", "projectId", "stateId", ...}],
      "_meta": {"teams_found": true, "users_found": false, ...}
    }
    ```
  - 데이터 필터링:
    - projects: `statusId`가 active 상태인 것만 (completed/canceled 제외). 필터 불가 시 전체 반환
    - cycles: `endsAt`이 현재 시각 이후인 것만 (과거 사이클 제외)
  - `--discover` 플래그와 공존 (Task 0에서 추가한 것 유지)

  **Must NOT do**:
  - `vendor/` 디렉토리 수정
  - 기존 `is_project_record()`, `is_team_record()` 등 수정 (추가만)
  - Python 스크립트를 클래스로 리팩토링
  - 모듈 분리

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 기존 패턴 따르되 3개 타입 추가 + 필터링 + 출력 포맷 변경 필요
  - **Skills**: [`git-master`]
    - `git-master`: 커밋 관리

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 2)
  - **Blocks**: Tasks 2, 3
  - **Blocked By**: Task 0

  **References**:

  **Pattern References**:
  - `scripts/export_linear_cache.py:36-58` — `is_project_record()`, `is_team_record()`, `is_issue_record()`, `is_workflow_state_record()` 패턴. 새 `is_user_record()`, `is_cycle_record()`, `is_label_record()`도 동일 패턴으로 작성
  - `scripts/export_linear_cache.py:114-151` — store 순회 + 타입별 분류 루프. 여기에 새 타입 3개 추가
  - `scripts/export_linear_cache.py:202-235` — `export_projects()` 출력 구조. 이걸 `export_all()`로 확장

  **API/Type References**:
  - `src/services/linear-client.ts:29-78` — `TeamInfo`, `ProjectInfo`, `UserInfo`, `WorkflowStateInfo`, `CycleInfo`, `LabelInfo` 인터페이스. Python 출력 JSON이 이 필드들을 포함해야 함

  **WHY Each Reference Matters**:
  - `is_*_record()` 함수들: 동일한 heuristic 패턴으로 새 타입 감지 함수 작성
  - TypeScript 인터페이스: Python JSON 출력의 필드가 이것과 매핑 가능해야 함

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Full data export returns version 3 JSON
    Tool: Bash
    Preconditions: Linear Desktop App installed, Python3 available
    Steps:
      1. python3 scripts/export_linear_cache.py
      2. Parse stdout as JSON
      3. Assert: version == 3
      4. Assert: keys include "teams", "projects", "users", "states", "cycles", "labels", "_meta"
      5. Assert: len(teams) > 0
      6. Assert: len(projects) > 0
      7. For each team: assert "id", "name", "key" fields exist
      8. For each project: assert "id", "name" fields exist
      9. Print counts for each data type
    Expected Result: All 6 data types present with valid structure
    Evidence: stdout captured with counts

  Scenario: _meta accurately reports found/not-found types
    Tool: Bash
    Preconditions: Same as above
    Steps:
      1. python3 scripts/export_linear_cache.py
      2. Parse _meta field
      3. For each type where _meta says found=true, assert array is non-empty
      4. For each type where _meta says found=false, assert array is empty
    Expected Result: _meta correctly reflects data availability
    Evidence: _meta JSON captured

  Scenario: Projects are filtered to active only
    Tool: Bash
    Preconditions: Same as above
    Steps:
      1. python3 scripts/export_linear_cache.py
      2. Parse projects array
      3. If statusId-based filtering is active, verify no completed/canceled projects
      4. Log project count vs total (from --discover)
    Expected Result: Only active projects in output
    Evidence: Project count logged

  Scenario: Graceful output when Linear not installed
    Tool: Bash
    Preconditions: Linear Desktop not installed (or invalid path)
    Steps:
      1. python3 scripts/export_linear_cache.py
      2. Assert: Exit code 0
      3. Assert: Valid JSON with version 3
      4. Assert: All arrays empty
      5. Assert: _meta shows all types as not found
    Expected Result: Empty but valid JSON
    Evidence: stdout captured
  ```

  **Commit**: YES
  - Message: `feat(cache): extend export_linear_cache.py to export all 6 data types (v3)`
  - Files: `scripts/export_linear_cache.py`
  - Pre-commit: `python3 scripts/export_linear_cache.py | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['version']==3; print('OK')"`

---

- [ ] 2. **TypeScript 서비스 확장 — 전체 데이터 파싱 + 타입 매핑**

  **What to do**:
  - `src/services/linear-local-cache.ts` 인터페이스 확장:
    - `LocalCacheData` v3: teams, projects, users, states, cycles, labels, issues, _meta 포함
    - 각 타입별 raw 인터페이스 정의 (Python JSON → TS)
  - 타입 매핑 함수 추가:
    - `mapTeams(raw) → TeamInfo[]` — issueEstimationType 등 누락 시 기본값 적용
    - `mapProjects(raw, issues) → ProjectInfo[]` — teamIds 매핑 + recentIssueTitles 생성
    - `mapUsers(raw) → UserInfo[]`
    - `mapStates(raw) → WorkflowStateInfo[]` — API와 동일한 정렬 적용
    - `mapCycles(raw) → CycleInfo[]` — API와 동일한 정렬 적용
    - `mapLabels(raw) → LabelInfo[]` — 알파벳 정렬
  - `loadLocalCache()` 함수 확장:
    - 반환 타입을 `LocalCacheDataV3 | null`로 변경
    - 타임아웃 5s → 8s
    - version 3 JSON 파싱
    - `_meta` 필드 기반으로 각 타입 available 여부 반환
  - 결과 구조:
    ```typescript
    interface LocalCacheResult {
      teams?: TeamInfo[];
      projects?: ProjectInfo[];
      users?: UserInfo[];
      states?: WorkflowStateInfo[];
      cycles?: CycleInfo[];
      labels?: LabelInfo[];
    }
    ```
    (undefined = 로컬에 없음 → API 폴백 필요)

  **Must NOT do**:
  - `linear-client.ts`의 기존 인터페이스(`TeamInfo`, `ProjectInfo` 등) 수정
  - 새로운 npm 의존성 추가
  - `loadLocalCache()`의 기존 에러 핸들링 패턴(null 반환) 변경

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: 인터페이스 설계 + 6개 매핑 함수 + 에러 핸들링
  - **Skills**: [`git-master`]
    - `git-master`: 커밋 관리

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 3)
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/services/linear-local-cache.ts:36-88` — 기존 `loadLocalCache()`. execFile 패턴, 타임아웃, JSON 파싱, null 폴백 패턴 유지
  - `src/services/linear-local-cache.ts:12-26` — 기존 인터페이스. 이걸 확장 (기존 것은 deprecated)

  **API/Type References**:
  - `src/services/linear-client.ts:29-78` — `TeamInfo`, `ProjectInfo`, `UserInfo`, `WorkflowStateInfo`, `CycleInfo`, `LabelInfo`. 매핑 대상 인터페이스
  - `src/services/linear-client.ts:142-157` — `getTeams()` 구현. issueEstimationType 기본값 'fibonacci' 참조
  - `src/services/linear-client.ts:211-247` — `getWorkflowStates()` 정렬 로직. 동일하게 적용 필요
  - `src/services/linear-client.ts:253-287` — `getCycles()` 정렬 로직. 동일하게 적용 필요

  **WHY Each Reference Matters**:
  - `loadLocalCache()`: 확장 대상. 동일한 패턴 유지하며 반환 타입만 확장
  - `getWorkflowStates()`/`getCycles()`: 정렬 로직을 TypeScript 쪽에서 동일하게 적용해야 함
  - `TeamInfo`: issueEstimationType의 기본값 'fibonacci' 처리 필요 (IndexedDB에 없을 수 있음)

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: TypeScript compilation passes
    Tool: Bash
    Preconditions: None
    Steps:
      1. npx tsc --noEmit
      2. Assert: Exit code 0
      3. Assert: No type errors in output
    Expected Result: Clean compilation
    Evidence: tsc output captured

  Scenario: Existing vitest tests still pass
    Tool: Bash
    Preconditions: None
    Steps:
      1. npx vitest run
      2. Assert: All tests pass
      3. Assert: No new failures
    Expected Result: All green
    Evidence: vitest output captured
  ```

  **Commit**: YES
  - Message: `feat(cache): extend linear-local-cache.ts to parse all 6 data types with type mapping`
  - Files: `src/services/linear-local-cache.ts`
  - Pre-commit: `npx tsc --noEmit`

---

- [ ] 3. **loadLinearData 통합 — 로컬 우선, per-data-type API 폴백**

  **What to do**:
  - `src/main/ipc-handlers.ts`의 `loadLinearData()` 함수 재구성:
    1. 먼저 `loadLocalCache()` 호출 (dynamic import 유지)
    2. 결과에서 각 타입별 available 확인
    3. available한 타입은 로컬 데이터 사용
    4. unavailable한 타입만 `linear.getXxx()` API 호출
    5. 모든 데이터를 `state.*Cache`에 저장 (기존과 동일)
  - 로직 흐름:
    ```
    localCache = await loadLocalCache()  // 8s 타임아웃, null on fail
    
    if (localCache) {
      // 로컬에서 가져올 수 있는 것은 로컬에서
      teams = localCache.teams ?? null
      projects = localCache.projects ?? null
      ...
    }
    
    // 로컬에서 못 가져온 것만 API로
    const apiCalls = []
    if (!teams) apiCalls.push(linear.getTeams().then(t => teams = t))
    if (!projects) apiCalls.push(linear.getProjects().then(p => projects = p))
    ...
    await Promise.all(apiCalls)
    ```
  - 로깅: 로컬에서 가져온 타입 vs API에서 가져온 타입 명시적 로그
    - `[LocalCache] teams: local, projects: local, users: api, states: local, cycles: api, labels: api`
  - 기존 `recentIssueTitles` 머지 로직은 로컬 캐시에서 issues 데이터가 있으면 직접 계산 (Python에서 이미 필터링된 issues 제공)
  - **전체 폴백**: `loadLocalCache()`가 null이면 기존과 완전히 동일하게 6개 API 호출

  **Must NOT do**:
  - `createIssue`, `searchIssues`, `validateLinearToken` 수정
  - IPC 핸들러 인터페이스 변경 (렌더러에서 받는 데이터 구조 동일)
  - Settings UI 변경

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: 기존 함수 수정, 로직은 단순 (로컬 있으면 사용, 없으면 API)
  - **Skills**: [`git-master`]
    - `git-master`: 커밋 관리

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (Wave 4)
  - **Blocks**: None (final)
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `src/main/ipc-handlers.ts:43-88` — 현재 `loadLinearData()` 전체 코드. 이걸 재구성
  - `src/main/ipc-handlers.ts:70-84` — 기존 로컬 캐시 dynamic import 패턴. 동일하게 사용

  **API/Type References**:
  - `src/main/state.ts` — AppState의 캐시 필드들 (teamsCache, projectsCache, etc.)
  - `src/services/linear-client.ts:348-358` — `createLinearServiceFromEnv()`. API 폴백 시 사용

  **WHY Each Reference Matters**:
  - `loadLinearData()`: 수정 대상. 현재 구조를 이해하고 로컬 우선으로 전환
  - `state.ts`: 캐시 필드에 값을 넣는 구조 확인 (기존과 동일하게 유지)

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: TypeScript compilation passes after integration
    Tool: Bash
    Preconditions: Tasks 0-2 완료
    Steps:
      1. npx tsc --noEmit
      2. Assert: Exit code 0
    Expected Result: Clean compilation
    Evidence: tsc output captured

  Scenario: Existing vitest tests still pass
    Tool: Bash
    Preconditions: None
    Steps:
      1. npx vitest run
      2. Assert: All tests pass
    Expected Result: All green
    Evidence: vitest output captured

  Scenario: No broken callers of loadLinearData
    Tool: ast_grep_search
    Preconditions: None
    Steps:
      1. Search for all references to loadLinearData in the codebase
      2. Verify each caller is compatible with the new signature (unchanged)
    Expected Result: loadLinearData signature unchanged, all callers compatible
    Evidence: Search results captured
  ```

  **Commit**: YES
  - Message: `feat(cache): loadLinearData now uses local cache first with per-type API fallback`
  - Files: `src/main/ipc-handlers.ts`
  - Pre-commit: `npx tsc --noEmit`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 0 | `feat(cache): add --discover flag to export_linear_cache.py` | scripts/export_linear_cache.py | python3 scripts/export_linear_cache.py --discover |
| 1 | `feat(cache): extend export_linear_cache.py to export all 6 data types (v3)` | scripts/export_linear_cache.py | python3 + JSON 검증 |
| 2 | `feat(cache): extend linear-local-cache.ts with full type mapping` | src/services/linear-local-cache.ts | npx tsc --noEmit |
| 3 | `feat(cache): loadLinearData local-first with per-type API fallback` | src/main/ipc-handlers.ts | npx tsc --noEmit && npx vitest run |

---

## Success Criteria

### Verification Commands
```bash
# Python 스크립트 6종 데이터 export 확인
python3 scripts/export_linear_cache.py | python3 -c "import json,sys; d=json.load(sys.stdin); assert d['version']==3; [print(f'{k}: {len(d[k])} items') for k in ['teams','projects','users','states','cycles','labels']]"

# TypeScript 컴파일
npx tsc --noEmit  # Expected: 0 errors

# 기존 테스트 통과
npx vitest run  # Expected: All tests pass
```

### Final Checklist
- [ ] Python 스크립트가 version 3 JSON 출력
- [ ] 6종 데이터 타입 모두 매핑 가능
- [ ] Linear Desktop 미설치 시 API 폴백 정상
- [ ] per-data-type 폴백 동작 (부분 로컬 + 부분 API)
- [ ] 기존 이슈 생성 기능 영향 없음
- [ ] TypeScript 컴파일 에러 없음
- [ ] 기존 테스트 전체 통과
