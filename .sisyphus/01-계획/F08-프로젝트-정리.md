# Linear Capture Cleanup Plan

## TL;DR

> **Quick Summary**: 프로젝트 전체 클린업 - 캐시 파일 삭제, 문서 통합, 디버그 로그 조건부 전환, index.ts 모듈 분할
> 
> **Deliverables**:
> - Python 캐시 및 시스템 파일 삭제
> - AI_CASE_STUDY 문서 통합 (6개 → 1개)
> - 완료된 .sisyphus/plans 아카이브
> - 123개 console.log → isDev 조건부 로그 전환
> - src/main/index.ts (1386줄) → 6개 모듈 분할
> 
> **Estimated Effort**: Medium-Large
> **Parallel Execution**: YES - Phase 1-2 병렬, Phase 3-4 순차
> **Critical Path**: Phase 1 → Phase 3 → Phase 4

---

## Context

### Original Request
프로젝트 클린업 계획 수립 및 실행

### Interview Summary
**Key Discussions**:
- Phase 1-3 먼저 진행, Phase 4는 마지막에
- 다른 worktree 작업 완료 후 머지하고 클린업 진행

**Research Findings**:
- `src/main/index.ts`: 1386줄 - IPC 핸들러, 윈도우 관리, OAuth 등 모두 포함
- 123개의 console.log/warn/debug 호출 (17개 파일)
- isDev 패턴이 이미 존재 (`!app.isPackaged`)
- 인증서 파일 2개는 동일 크기지만 다른 내용 (MD5 해시 다름)
- boulder.json의 active_plan은 다른 worktree 참조

### Metis Review
**Identified Gaps** (addressed):
- 인증서 파일이 중복이 아님 → 삭제 대상에서 제외
- .sisyphus/plans 아카이브 전 boulder.json 확인 필요 → 확인 완료, 안전

---

## Work Objectives

### Core Objective
코드 품질 개선 및 프로젝트 정리를 통한 유지보수성 향상

### Concrete Deliverables
- 불필요한 캐시/시스템 파일 삭제
- 문서 통합 및 정리
- 프로덕션 로그 최적화
- 메인 모듈 분할

### Definition of Done
- [ ] Python 캐시 파일 0개
- [ ] .DS_Store 파일 0개
- [ ] AI_CASE_STUDY 파일 1개만 존재
- [ ] console.log 호출이 모두 isDev 조건부로 래핑됨
- [ ] src/main/index.ts가 300줄 이하
- [ ] 모든 테스트 통과: `npm test`
- [ ] 앱 정상 빌드: `npm run pack`

### Must Have
- isDev 패턴 사용 (`!app.isPackaged`)
- 기존 기능 100% 유지
- 테스트 통과

### Must NOT Have (Guardrails)
- 인증서 파일 삭제 금지 (2601-cert.p12, 2601Certificates.p12 모두 유지)
- boulder.json 수정 금지
- 새로운 npm 의존성 추가 금지
- 기능 변경 금지 (순수 리팩토링만)

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **User wants tests**: YES (기존 테스트 유지)
- **Framework**: vitest

### Automated Verification

```bash
# 테스트 실행
npm test

# 빌드 확인
npm run pack

# 앱 실행 확인
open 'release/mac-arm64/Linear Capture.app'
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: Python 캐시 삭제
├── Task 2: .DS_Store 삭제
└── Task 3: AI_CASE_STUDY 통합

Wave 2 (After Wave 1):
└── Task 4: .sisyphus/plans 아카이브

Wave 3 (After Wave 2):
└── Task 5: Logger 유틸 생성 + console.log 전환

Wave 4 (After Wave 3):
└── Task 6: index.ts 분할

Critical Path: Task 1 → Task 5 → Task 6
```

---

## TODOs

### Phase 1: Safe File Deletion

- [ ] 1. Python 캐시 파일 삭제

  **What to do**:
  - `scripts/vendor/` 하위의 모든 `__pycache__` 디렉토리 삭제
  - 모든 `.pyc` 파일 삭제

  **Must NOT do**:
  - `.py` 소스 파일 삭제 금지
  - vendor 외부 파일 건드리지 않음

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
    - 단순 파일 삭제 작업

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `scripts/vendor/ccl_chromium_reader/` - Python 캐시 위치
  - `scripts/vendor/ccl_simplesnappy/` - Python 캐시 위치

  **Acceptance Criteria**:
  ```bash
  # 실행
  find scripts/vendor -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null
  find scripts/vendor -name "*.pyc" -type f -delete

  # 검증
  find scripts/vendor -name "__pycache__" -type d | wc -l
  # Assert: 0

  find scripts/vendor -name "*.pyc" -type f | wc -l
  # Assert: 0
  ```

  **Commit**: YES
  - Message: `chore: remove Python cache files`
  - Files: `scripts/vendor/**/__pycache__`, `scripts/vendor/**/*.pyc`

---

- [ ] 2. .DS_Store 파일 삭제

  **What to do**:
  - 프로젝트 전체에서 `.DS_Store` 파일 삭제
  - `.gitignore`에 이미 포함되어 있으므로 Git 영향 없음

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `.gitignore` - .DS_Store 이미 포함됨

  **Acceptance Criteria**:
  ```bash
  # 실행
  find . -name ".DS_Store" -delete

  # 검증
  find . -name ".DS_Store" | wc -l
  # Assert: 0
  ```

  **Commit**: NO (Git에서 추적하지 않음)

---

### Phase 2: Document Cleanup

- [ ] 3. AI_CASE_STUDY 문서 통합

  **What to do**:
  - 6개의 AI_CASE_STUDY 파일을 `docs/AI_CASE_STUDIES.md`로 통합
  - 각 케이스 스터디를 날짜순으로 정리
  - 원본 파일들은 삭제

  **Must NOT do**:
  - 내용 수정 금지 (통합만)

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `AI_CASE_STUDY.md` (11,934 bytes) - 2026-01-15
  - `AI_CASE_STUDY_2.md` (3,808 bytes) - 2026-01-29
  - `AI_CASE_STUDY_v2.md` (8,643 bytes) - 2026-01-19
  - `AI_CASE_STUDY_v3.md` (9,602 bytes) - 2026-01-25
  - `AI_CASE_STUDY_i18n.md` (8,253 bytes) - 2026-02-02
  - `AI_CASE_STUDY_WORKTREE.md` (8,158 bytes) - 2026-02-02

  **Acceptance Criteria**:
  ```bash
  # 검증: 통합 파일 존재
  ls docs/AI_CASE_STUDIES.md
  # Assert: 파일 존재

  # 검증: 원본 파일 삭제됨
  ls AI_CASE_STUDY*.md 2>/dev/null | wc -l
  # Assert: 0

  # 검증: 모든 내용 포함
  wc -l docs/AI_CASE_STUDIES.md
  # Assert: 약 400줄 이상 (모든 내용 통합)
  ```

  **Commit**: YES
  - Message: `docs: consolidate AI case study files`
  - Files: `docs/AI_CASE_STUDIES.md`, `AI_CASE_STUDY*.md` (deleted)

---

- [ ] 4. 완료된 .sisyphus/plans 아카이브

  **What to do**:
  - `.sisyphus/plans/` 내 모든 .md 파일을 `.sisyphus/archive/` 로 이동
  - boulder.json의 active_plan은 다른 worktree를 가리키므로 안전
  - `cleanup.md` (이 플랜)는 이동하지 않음

  **Must NOT do**:
  - boulder.json 수정 금지
  - cleanup.md 이동 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Tasks 1, 2, 3

  **References**:
  - `.sisyphus/boulder.json` - active_plan: 다른 worktree의 i18n.md
  - `.sisyphus/plans/` - 32개 파일

  **Acceptance Criteria**:
  ```bash
  # 실행
  mkdir -p .sisyphus/archive
  mv .sisyphus/plans/*.md .sisyphus/archive/ 2>/dev/null || true
  mv .sisyphus/archive/cleanup.md .sisyphus/plans/ 2>/dev/null || true

  # 검증: plans에 cleanup.md만 존재
  ls .sisyphus/plans/*.md
  # Assert: cleanup.md만 출력

  # 검증: archive에 나머지 파일들
  ls .sisyphus/archive/*.md | wc -l
  # Assert: 31개 이상
  ```

  **Commit**: YES
  - Message: `chore: archive completed Sisyphus plans`
  - Files: `.sisyphus/plans/`, `.sisyphus/archive/`

---

### Phase 3: Debug Log Cleanup

- [ ] 5. console.log → isDev 조건부 로그 전환

  **What to do**:
  - `src/services/utils/logger.ts` 생성
  - isDev 패턴 활용 (`!app.isPackaged` 또는 `process.env.NODE_ENV`)
  - 17개 파일의 123개 console.log/warn/debug 호출을 logger로 교체
  - 중요한 에러 로그 (console.error)는 유지

  **Logger 구현**:
  ```typescript
  // src/services/utils/logger.ts
  const isDev = process.env.NODE_ENV !== 'production';
  
  export const logger = {
    debug: (...args: unknown[]) => isDev && console.log(...args),
    info: (...args: unknown[]) => isDev && console.log(...args),
    warn: (...args: unknown[]) => console.warn(...args),
    error: (...args: unknown[]) => console.error(...args),
  };
  ```

  **Must NOT do**:
  - console.error 제거 금지 (에러는 항상 로그)
  - 기능 로직 변경 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
    - AST 기반 패턴 교체 가능

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 6
  - **Blocked By**: Tasks 1-4

  **References**:
  - `src/main/i18n.ts:44` - isDev 패턴 예시
  - `src/services/auto-updater.ts:7-10` - 기존 logger 패턴 참고

  **파일별 console 호출 수**:
  | 파일 | 호출 수 |
  |------|---------|
  | src/main/index.ts | ~40 |
  | src/services/auto-updater.ts | 11 |
  | src/services/semantic-search.ts | 10 |
  | src/services/local-vector-store.ts | 7 |
  | 기타 13개 파일 | ~55 |

  **Acceptance Criteria**:
  ```bash
  # 검증: logger.ts 존재
  ls src/services/utils/logger.ts
  # Assert: 파일 존재

  # 검증: console.log 직접 호출 최소화
  grep -r "console\.log" src/ --include="*.ts" | grep -v "logger.ts" | grep -v "test" | wc -l
  # Assert: 10개 이하 (일부 예외 허용)

  # 검증: 테스트 통과
  npm test
  # Assert: 모든 테스트 통과

  # 검증: 빌드 성공
  npm run build
  # Assert: 에러 없음
  ```

  **Commit**: YES
  - Message: `refactor: replace console.log with conditional logger`
  - Files: `src/services/utils/logger.ts`, 17개 수정 파일

---

### Phase 4: Module Split

- [ ] 6. src/main/index.ts 모듈 분할

  **What to do**:
  - 1386줄 파일을 6개 모듈로 분할
  - 기존 exports 유지

  **분할 구조**:
  ```
  src/main/
  ├── index.ts              (~150줄) - 앱 초기화, 진입점
  ├── ipc-handlers.ts       (~400줄) - 모든 ipcMain.handle()
  ├── window-manager.ts     (~200줄) - 윈도우 생성/관리
  ├── capture-session.ts    (~200줄) - 캡처 세션 상태/로직
  ├── oauth-handlers.ts     (~150줄) - Slack/Notion/Gmail OAuth
  ├── hotkey.ts             (기존 유지)
  ├── tray.ts               (기존 유지)
  └── i18n.ts               (기존 유지)
  ```

  **Must NOT do**:
  - 기능 변경 금지
  - 새 의존성 추가 금지
  - 외부 API 변경 금지

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
    - 대규모 리팩토링, LSP 활용

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4 (마지막)
  - **Blocks**: None
  - **Blocked By**: Task 5

  **References**:
  - `src/main/index.ts:1-100` - 앱 초기화 로직
  - `src/main/index.ts:500-900` - IPC 핸들러들
  - `src/main/index.ts:300-500` - 윈도우 관리
  - `src/main/index.ts:60-200` - OAuth 콜백 처리
  - `src/main/index.ts:400-500` - 캡처 세션 관리

  **Acceptance Criteria**:
  ```bash
  # 검증: index.ts 크기 감소
  wc -l src/main/index.ts
  # Assert: 200줄 이하

  # 검증: 새 모듈 생성됨
  ls src/main/ipc-handlers.ts src/main/window-manager.ts src/main/capture-session.ts src/main/oauth-handlers.ts
  # Assert: 모든 파일 존재

  # 검증: 테스트 통과
  npm test
  # Assert: 모든 테스트 통과

  # 검증: 빌드 성공
  npm run pack
  # Assert: 에러 없음

  # 검증: 앱 정상 실행
  open 'release/mac-arm64/Linear Capture.app'
  # Assert: 앱 정상 시작, 트레이 아이콘 표시
  ```

  **Commit**: YES (분할 커밋)
  - Message: `refactor(main): split index.ts into focused modules`
  - Files: `src/main/index.ts`, `src/main/ipc-handlers.ts`, `src/main/window-manager.ts`, `src/main/capture-session.ts`, `src/main/oauth-handlers.ts`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `chore: remove Python cache files` | scripts/vendor/ | find 명령 |
| 3 | `docs: consolidate AI case study files` | docs/, AI_*.md | ls, wc |
| 4 | `chore: archive completed Sisyphus plans` | .sisyphus/ | ls |
| 5 | `refactor: replace console.log with conditional logger` | src/**/*.ts | npm test |
| 6 | `refactor(main): split index.ts into focused modules` | src/main/*.ts | npm run pack |

---

## Success Criteria

### Verification Commands
```bash
# Python 캐시 없음
find scripts/vendor -name "*.pyc" | wc -l  # Expected: 0

# AI_CASE_STUDY 통합됨
ls AI_CASE_STUDY*.md 2>/dev/null | wc -l  # Expected: 0
ls docs/AI_CASE_STUDIES.md  # Expected: 파일 존재

# console.log 최소화
grep -r "console\.log" src/ --include="*.ts" | grep -v logger | grep -v test | wc -l  # Expected: <10

# index.ts 분할됨
wc -l src/main/index.ts  # Expected: <200

# 테스트 통과
npm test  # Expected: 모든 테스트 통과

# 빌드 성공
npm run pack  # Expected: 에러 없음
```

### Final Checklist
- [ ] 모든 "Must Have" 충족
- [ ] 모든 "Must NOT Have" 위반 없음
- [ ] 모든 테스트 통과
- [ ] 앱 정상 빌드 및 실행
