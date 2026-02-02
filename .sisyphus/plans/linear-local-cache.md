# Linear Local Cache Integration for Better Project Matching

## TL;DR

> **Quick Summary**: Linear Desktop App의 로컬 IndexedDB 캐시에서 "최근 이슈 제목"을 추출하여 AI 분석 컨텍스트에 포함, 프로젝트 매칭 정확도를 50%→100% 수준으로 향상. 또한 Assignee 기본값을 API 토큰 소유자로 자동 설정.
> 
> **Deliverables**:
> - Python 스크립트 (Linear 캐시 읽기) 및 TypeScript 서비스 (spawn + 파싱)
> - AI 분석 시 "최근 이슈 제목" 컨텍스트 전달
> - Assignee 기본값 자동 설정
> - 단위 테스트
> 
> **Estimated Effort**: Medium (1-2일)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 3 → Task 5

---

## Context

### Original Request
사용자가 Linear Capture 앱의 프로젝트 매칭이 부정확하다고 피드백. slack-linear-sync 프로젝트에서 검증된 "최근 이슈 제목 포함" 방식을 차용하여 정확도 개선 요청. 추가로 Assignee 기본값을 본인으로 설정 요청.

### Interview Summary
**Key Discussions**:
- 캐시 읽기 방식: Python 스크립트 spawn (기존 검증된 코드 재활용)
- Fallback 전략: Python 미설치 또는 캐시 없으면 기존 방식 그대로 (추가 API 호출 없음)
- Assignee 기본값: API 토큰 검증 시 받은 viewer 정보로 자동 설정
- 테스트: 단위 테스트 추가

**Research Findings**:
- Linear Desktop 캐시: `~/Library/Application Support/Linear/IndexedDB/https_linear.app_0.indexeddb.leveldb`
- slack-linear-sync의 `export_projects.py`가 이미 IndexedDB 파싱 로직 포함
- 핵심 인사이트: 최근 이슈 제목 포함 시 AI 매칭 정확도 50%→거의100%

### Metis Review
**Identified Gaps** (addressed):
- Native 모듈 빌드 복잡성 → Python spawn 방식으로 회피
- DB 잠금 위험 → Python 스크립트에서 read-only로 처리, 실패 시 graceful fallback
- "최근 이슈" 기준 미정의 → 프로젝트별 최근 10개, 완료/취소 제외

---

## Work Objectives

### Core Objective
Linear Desktop App의 로컬 캐시에서 프로젝트별 "최근 이슈 제목"을 추출하여 AI 분석 시 컨텍스트로 제공, 프로젝트 매칭 정확도 대폭 향상. Assignee 기본값을 토큰 소유자로 설정.

### Concrete Deliverables
- `scripts/export_linear_cache.py` - Linear 캐시 읽기 Python 스크립트
- `src/services/linear-local-cache.ts` - Python spawn 및 결과 파싱 서비스
- `src/main/index.ts` 수정 - 캐시 로드 및 AI 컨텍스트 연동
- `src/services/gemini-analyzer.ts` 수정 - 최근 이슈 컨텍스트 활용
- `src/renderer/index.html` 수정 - Assignee 기본값 설정
- `src/__tests__/linear-local-cache.test.ts` - 단위 테스트

### Definition of Done
- [x] Linear Desktop 설치 환경에서 AI 분석 시 "최근 이슈 제목"이 컨텍스트에 포함됨
- [x] Python/Linear Desktop 미설치 환경에서 기존 방식대로 정상 동작
- [x] 캡처 창 열 때 Assignee가 자동으로 토큰 소유자로 선택됨
- [x] 단위 테스트 통과

### Must Have
- Python 스크립트로 IndexedDB 캐시 읽기
- 프로젝트별 최근 이슈 제목 10개 추출
- Graceful fallback (에러 시 기존 방식)
- Assignee 기본값 자동 설정

### Must NOT Have (Guardrails)
- Native 모듈 (leveldown 등) 사용 금지
- 앱에 Python 번들링 금지
- Python 미설치 시 추가 API 호출 금지 (기존 방식 유지)
- 새로운 UI 요소 추가 금지 (캐시 상태 표시 등)
- 앱 시작 시간 500ms 이상 지연 금지

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (bun test 설정됨)
- **User wants tests**: YES (단위 테스트)
- **Framework**: bun test

### TDD Approach

각 TODO에서 테스트와 구현을 함께 진행:
1. 테스트 파일 작성 (mock 데이터 포함)
2. 구현 코드 작성
3. `bun test` → PASS 확인

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Python 스크립트 생성 [no dependencies]
└── Task 2: Assignee 기본값 설정 [no dependencies]

Wave 2 (After Wave 1):
├── Task 3: TypeScript 서비스 생성 [depends: 1]
└── Task 4: 단위 테스트 작성 [depends: 3]

Wave 3 (After Wave 2):
└── Task 5: AI 분석 컨텍스트 연동 [depends: 3]

Critical Path: Task 1 → Task 3 → Task 5
Parallel Speedup: ~30% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 3, 4 | 2 |
| 2 | None | None | 1 |
| 3 | 1 | 4, 5 | None |
| 4 | 3 | None | None |
| 5 | 3 | None | 4 |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1, 2 | delegate_task(category="quick", load_skills=[], run_in_background=true) |
| 2 | 3, 4 | delegate_task(category="unspecified-low", load_skills=[]) |
| 3 | 5 | delegate_task(category="quick", load_skills=[]) |

---

## TODOs

- [x] 1. Python 스크립트 생성: export_linear_cache.py

  **What to do**:
  - slack-linear-sync의 `export_projects.py`를 기반으로 새 스크립트 생성
  - `scripts/export_linear_cache.py` 위치에 생성
  - `ccl_chromium_reader` vendor 파일 포함 (또는 경로 설정)
  - 출력 형식: JSON (stdout), 에러는 stderr
  - 프로젝트별 `recentIssueTitles` 필드 포함

  **Must NOT do**:
  - 외부 의존성 설치 필요 없는 standalone 스크립트로 구성
  - Linear Desktop 미설치 시 빈 JSON 반환 (`{"projects": []}`)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 기존 코드 복사 + 약간의 수정으로 완성 가능
  - **Skills**: `[]`
    - Python 스크립트 작성은 기본 역량으로 충분

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3, Task 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `/Users/wine_ny/side-project/linear_project/slack-linear-sync/scripts/linear-sync/export_projects.py` - 전체 로직 참고 (IndexedDB 읽기, 프로젝트/이슈 파싱, 최근 이슈 추출)

  **API/Type References**:
  - 출력 JSON 형식:
    ```json
    {
      "version": 2,
      "updatedAt": "ISO8601",
      "projects": [
        {
          "id": "...",
          "name": "...",
          "teamId": "...",
          "recentIssueTitles": ["이슈1", "이슈2", ...]
        }
      ]
    }
    ```

  **Documentation References**:
  - `/Users/wine_ny/side-project/linear_project/slack-linear-sync/AI_CASE_STUDY_LOCAL_CACHE.md` - 왜 이 방식이 효과적인지 설명

  **External References**:
  - `ccl_chromium_reader` vendor 위치: `/Users/wine_ny/side-project/linear-mcp-fast/vendor/ccl_chromium_reader`
  - `ccl_simplesnappy` vendor 위치: `/Users/wine_ny/side-project/linear-mcp-fast/vendor/ccl_simplesnappy`

  **Acceptance Criteria**:
  - [ ] `python3 scripts/export_linear_cache.py` 실행 시 JSON 출력
  - [ ] Linear Desktop 미설치 시 `{"projects": []}` 반환 (에러 없이)
  - [ ] 프로젝트별 `recentIssueTitles` 배열 포함 (최대 10개)
  - [ ] stderr에 에러 메시지, stdout에는 JSON만 출력

  **Commit**: YES
  - Message: `feat(cache): add Python script for Linear local cache extraction`
  - Files: `scripts/export_linear_cache.py`, `scripts/vendor/` (필요 시)

---

- [x] 2. Assignee 기본값 설정: 토큰 소유자로 자동 선택

  **What to do**:
  - `src/renderer/index.html`에서 `capture-ready` 이벤트 핸들러 수정
  - `data.userInfo` (토큰 검증 시 저장된 viewer 정보)를 기본 Assignee로 설정
  - `assigneeSearchable.selectOption()`으로 자동 선택

  **Must NOT do**:
  - AI 분석 결과가 있으면 AI 추천 우선 (기존 로직 유지)
  - 새로운 IPC 핸들러 추가 금지 (기존 데이터 활용)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 기존 코드에 몇 줄 추가로 완성
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/renderer/index.html:1620-1626` - `assigneeSearchable` 초기화 및 `selectOption` 사용 예시
  - `src/renderer/index.html:1700-1706` - AI 분석 결과로 assignee 설정하는 패턴

  **API/Type References**:
  - `src/services/settings-store.ts` - `UserInfo` 타입 정의: `{ id, name, email }`
  - `src/main/index.ts:637` - `setUserInfo(data.userInfo)` 호출부

  **Documentation References**:
  - `src/main/index.ts:225-243` - `capture-ready` 이벤트에서 전송하는 데이터 구조

  **Acceptance Criteria**:
  - [ ] 캡처 창 열 때 Assignee가 자동으로 토큰 소유자로 선택됨
  - [ ] AI 분석 후 `suggestedAssigneeId`가 있으면 그것으로 덮어씀 (기존 동작)
  - [ ] `main/index.ts`에서 `userInfo`를 `capture-ready` 데이터에 포함

  **Commit**: YES
  - Message: `feat(assignee): default assignee to API token owner`
  - Files: `src/renderer/index.html`, `src/main/index.ts`

---

- [x] 3. TypeScript 서비스 생성: linear-local-cache.ts

  **What to do**:
  - `src/services/linear-local-cache.ts` 새 파일 생성
  - Python 스크립트 spawn 및 stdout JSON 파싱
  - 에러 처리: Python 미설치, 스크립트 실패, 타임아웃 → 빈 배열 반환
  - 인터페이스: `loadLocalCache(): Promise<LocalCacheData | null>`

  **Must NOT do**:
  - Native 모듈 사용 금지
  - 5초 이상 타임아웃 허용 금지

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
    - Reason: 새 서비스 파일 생성 + spawn 로직 구현
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (sequential)
  - **Blocks**: Task 4, Task 5
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/services/linear-client.ts` - 기존 서비스 파일 구조 참고
  - Node.js `child_process.spawn` 또는 `execFile` 사용

  **API/Type References**:
  - 입력: 없음 (스크립트가 알아서 캐시 경로 찾음)
  - 출력 인터페이스:
    ```typescript
    interface LocalCacheProject {
      id: string;
      name: string;
      teamId: string;
      recentIssueTitles: string[];
    }
    
    interface LocalCacheData {
      version: number;
      updatedAt: string;
      projects: LocalCacheProject[];
    }
    ```

  **External References**:
  - Node.js `child_process`: https://nodejs.org/api/child_process.html

  **Acceptance Criteria**:
  - [ ] `loadLocalCache()` 함수가 `LocalCacheData | null` 반환
  - [ ] Python 미설치 시 `null` 반환 (에러 로그만)
  - [ ] 스크립트 실행 5초 이상 걸리면 타임아웃 처리
  - [ ] JSON 파싱 실패 시 `null` 반환

  **Commit**: YES
  - Message: `feat(cache): add TypeScript service for local cache loading`
  - Files: `src/services/linear-local-cache.ts`

---

- [x] 4. 단위 테스트 작성: linear-local-cache.test.ts

  **What to do**:
  - `src/__tests__/linear-local-cache.test.ts` 생성
  - `loadLocalCache()` 함수 테스트
  - Mock: `child_process.spawn` mocking으로 다양한 시나리오 테스트
  - 테스트 케이스: 정상 동작, Python 미설치, 타임아웃, JSON 파싱 실패

  **Must NOT do**:
  - 실제 Python 스크립트 실행 금지 (mock 사용)
  - 외부 의존성 추가 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 테스트 코드 작성은 패턴이 정해져 있음
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (after Task 3)
  - **Blocks**: None
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `src/__tests__/analyzer.test.ts` - 기존 테스트 파일 구조 참고
  - `bun test` 사용

  **API/Type References**:
  - `child_process` mocking with `jest.mock` 또는 bun의 mock 기능

  **Acceptance Criteria**:
  - [ ] `bun test src/__tests__/linear-local-cache.test.ts` 통과
  - [ ] 최소 4개 테스트 케이스: 성공, Python 미설치, 타임아웃, 파싱 실패
  - [ ] 각 테스트가 독립적으로 실행 가능

  **Commit**: YES (groups with 3)
  - Message: `test(cache): add unit tests for local cache service`
  - Files: `src/__tests__/linear-local-cache.test.ts`

---

- [x] 5. AI 분석 컨텍스트 연동: 최근 이슈 제목 포함

  **What to do**:
  - `src/main/index.ts`에서 `loadLinearData()` 시 로컬 캐시도 함께 로드
  - `projectsCache`에 `recentIssueTitles` 필드 추가 (캐시 있으면 merge)
  - `src/services/gemini-analyzer.ts`에서 프로젝트 컨텍스트에 최근 이슈 포함
  - `src/services/anthropic-analyzer.ts`도 동일하게 수정

  **Must NOT do**:
  - 앱 시작 시간 500ms 이상 지연 금지 (async로 처리)
  - 캐시 로드 실패 시 앱 동작에 영향 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 기존 코드에 필드 추가 및 포맷 변경
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (can run with Task 4)
  - **Parallel Group**: Wave 3
  - **Blocks**: None
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `src/main/index.ts:378-408` - `loadLinearData()` 함수
  - `src/services/gemini-analyzer.ts:50-80` - `AnalysisContext` 사용부
  - `slack-linear-sync` AI 분석에서 컨텍스트 포맷 참고

  **API/Type References**:
  - `src/services/gemini-analyzer.ts` - `AnalysisContext` 타입에 `recentIssueTitles` 추가
  - `src/services/linear-client.ts:36-43` - `ProjectInfo` 인터페이스에 `recentIssueTitles?: string[]` 추가

  **Documentation References**:
  - AI 프롬프트 수정: 프로젝트 설명에 "최근 이슈: [목록]" 추가

  **Acceptance Criteria**:
  - [ ] AI 분석 시 프로젝트 컨텍스트에 최근 이슈 제목 포함
  - [ ] 캐시 없으면 기존 방식대로 동작 (recentIssueTitles 없음)
  - [ ] 앱 시작 시간 증가 100ms 미만

  **Commit**: YES
  - Message: `feat(ai): include recent issue titles in analysis context`
  - Files: `src/main/index.ts`, `src/services/gemini-analyzer.ts`, `src/services/anthropic-analyzer.ts`, `src/services/linear-client.ts`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(cache): add Python script for Linear local cache extraction` | `scripts/export_linear_cache.py`, `scripts/vendor/` | `python3 scripts/export_linear_cache.py` |
| 2 | `feat(assignee): default assignee to API token owner` | `src/renderer/index.html`, `src/main/index.ts` | `npm run pack` |
| 3+4 | `feat(cache): add TypeScript service for local cache loading` + `test(cache): add unit tests for local cache service` | `src/services/linear-local-cache.ts`, `src/__tests__/linear-local-cache.test.ts` | `bun test` |
| 5 | `feat(ai): include recent issue titles in analysis context` | `src/main/index.ts`, `src/services/*.ts` | `npm run pack` + 수동 테스트 |

---

## Success Criteria

### Verification Commands
```bash
# 1. Python 스크립트 테스트
python3 scripts/export_linear_cache.py | jq .

# 2. 단위 테스트
bun test

# 3. 빌드 및 실행
npm run pack && open 'release/mac-arm64/Linear Capture.app'
```

### Final Checklist
- [x] Linear Desktop 있는 환경에서 AI 분석 시 "최근 이슈 제목" 컨텍스트 포함
- [x] Linear Desktop 없는 환경에서 기존 방식대로 정상 동작
- [x] 캡처 창 열 때 Assignee가 토큰 소유자로 자동 선택
- [x] 모든 테스트 통과 (`bun test`)
- [x] 앱 시작 시간 500ms 이상 증가 없음
