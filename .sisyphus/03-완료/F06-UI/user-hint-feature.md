# User Hint Feature for Linear Capture

## Context

### Original Request
캡처된 이미지에 복합적인 내용이 있을 때, 사용자가 선택적으로 프롬프트(힌트)를 입력하면 AI가 해당 포인트에 집중해서 이슈를 생성하도록 하는 기능 추가.

### Interview Summary
**Key Discussions**:
- UI 위치: 이미지 갤러리 아래에 멀티라인 textarea
- 빈 힌트 동작: 기존처럼 AI 자동 분석 (선택적 기능)
- 테스트 전략: TDD with Vitest
- Worker 수정: 포함 (linear-capture-worker 폴더)
- Placeholder: 한글 ("집중할 내용을 입력하세요 (선택사항)")
- 글자 제한: 없음

**Research Findings**:
- Worker(`linear-capture-worker/src/index.ts`)가 동일 프로젝트 내에 있음
- `AnalysisRequest` 인터페이스에 `instruction` 필드 추가 필요
- `buildImagePrompt()` 함수가 instruction을 프롬프트에 포함하도록 수정 필요

### Metis Review
**Identified Gaps** (addressed):
- Worker 호환성: Worker 코드가 같은 프로젝트에 있어 함께 수정
- UI 정확한 위치: 갤러리(L781) 아래, AI 모델 선택(L786) 위로 확정
- 빈 힌트 처리: `.trim()` 후 빈 문자열이면 instruction 생략

---

## Work Objectives

### Core Objective
사용자가 캡처 후 선택적으로 힌트를 입력하면 AI가 해당 포인트에 집중하여 Linear 이슈를 생성하도록 한다.

### Concrete Deliverables
1. **App (linear-capture)**
   - `src/renderer/index.html`: 힌트 textarea UI 추가
   - `src/main/index.ts`: IPC 핸들러에 instruction 파라미터 추가
   - `src/services/anthropic-analyzer.ts`: AnalysisContext에 instruction 추가
   - `src/services/gemini-analyzer.ts`: AnalysisContext에 instruction 추가

2. **Worker (linear-capture-worker)**
   - `src/index.ts`: AnalysisRequest에 instruction 필드 추가
   - `src/prompts/types.ts`: PromptContext에 instruction 추가
   - `src/prompts/issue-prompt.ts`: buildImagePrompt()가 instruction 포함

3. **Tests**
   - Vitest 설정 파일
   - instruction 필드 전달 테스트

### Definition of Done
- [x] `npm run build` 성공
- [x] `npm run test` 모든 테스트 통과
- [x] 빈 힌트로 분석 시 기존과 동일하게 동작
- [x] 힌트 입력 시 AI 응답에 힌트 내용이 반영됨
- [x] Worker 배포 후 앱에서 정상 동작

### Must Have
- 힌트 textarea UI (갤러리 아래)
- instruction 필드가 Worker까지 전달
- 빈 힌트 = 기존 동작 (regression 없음)
- TDD 테스트 코드

### Must NOT Have (Guardrails)
- 힌트 저장/히스토리 기능
- 이미지별 개별 힌트
- 글자 수 카운터 UI
- 힌트 입력 시 UI 흐름 변경
- "분석 시작" 버튼 라벨 변경
- 힌트 validation (trim 외)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (신규 설정 필요)
- **User wants tests**: TDD
- **Framework**: Vitest

### TDD Workflow
각 TODO는 RED-GREEN-REFACTOR 패턴:
1. **RED**: 실패하는 테스트 먼저 작성
2. **GREEN**: 테스트 통과하는 최소 코드 구현
3. **REFACTOR**: 코드 정리 (테스트 유지)

---

## Task Flow

```
Task 0 (Git Branch)
    ↓
Task 1 (Vitest Setup)
    ↓
Task 2 (Worker Types) ─────┐
    ↓                      │
Task 3 (Worker Prompt)     │
    ↓                      │
Task 4 (Worker Deploy) ────┘
    ↓
Task 5 (App Services) ← depends on Worker types
    ↓
Task 6 (App IPC Handler)
    ↓
Task 7 (App UI)
    ↓
Task 8 (Integration Test)
    ↓
Task 9 (Commit & Merge)
```

## Parallelization

| Group | Tasks | Reason |
|-------|-------|--------|
| - | 2, 3 | Worker types와 prompt는 순차적 (prompt가 types 사용) |

| Task | Depends On | Reason |
|------|------------|--------|
| 1 | 0 | 브랜치 생성 후 작업 |
| 5 | 4 | Worker 배포 후 앱이 새 API 사용 |
| 7 | 6 | IPC 핸들러가 준비된 후 UI 연결 |

---

## TODOs

### Pre-work

- [x] 0. Feature 브랜치 생성

  **What to do**:
  - main에서 `feature/user-hint` 브랜치 생성
  
  **Must NOT do**:
  - main에서 직접 작업

  **Parallelizable**: NO (첫 번째 작업)

  **References**:
  - 없음 (git 명령어만 사용)

  **Acceptance Criteria**:
  - [ ] `git checkout -b feature/user-hint` 실행
  - [ ] `git branch` → `* feature/user-hint` 확인

  **Commit**: NO

---

### Test Infrastructure

- [x] 1. Vitest 테스트 인프라 설정

  **What to do**:
  - Vitest 설치: `npm install -D vitest`
  - `vitest.config.ts` 생성
  - `package.json`에 test 스크립트 추가
  - 예제 테스트 파일로 설정 검증

  **Must NOT do**:
  - Jest 사용
  - E2E 테스트 설정

  **Parallelizable**: NO (Task 0 이후)

  **References**:

  **Pattern References**:
  - `package.json:7-20` - 기존 스크립트 패턴 참고
  - `tsconfig.json` - TypeScript 설정 참고

  **External References**:
  - Vitest 공식 문서: https://vitest.dev/guide/

  **Acceptance Criteria**:

  **RED**:
  - [ ] `src/__tests__/example.test.ts` 생성
  - [ ] 테스트: `expect(true).toBe(false)`
  - [ ] `npm test` → FAIL

  **GREEN**:
  - [ ] 테스트 수정: `expect(true).toBe(true)`
  - [ ] `npm test` → PASS

  **Manual Verification**:
  - [ ] `npm test` 실행 → "1 passed" 출력 확인

  **Commit**: YES
  - Message: `chore: setup vitest test infrastructure`
  - Files: `vitest.config.ts`, `package.json`, `src/__tests__/example.test.ts`

---

### Worker 수정 (linear-capture-worker)

- [x] 2. Worker 타입에 instruction 필드 추가

  **What to do**:
  - `src/prompts/types.ts`의 `PromptContext`에 `instruction?: string` 추가
  - `src/index.ts`의 `AnalysisRequest`에 `instruction?: string` 추가

  **Must NOT do**:
  - 기존 필드 변경
  - 런타임 로직 수정 (타입만)

  **Parallelizable**: NO (Task 1 이후)

  **References**:

  **Pattern References**:
  - `linear-capture-worker/src/prompts/types.ts:1-4` - PromptContext 인터페이스
  - `linear-capture-worker/src/index.ts:11-18` - AnalysisRequest 인터페이스

  **Acceptance Criteria**:

  **RED**:
  - [ ] `src/__tests__/worker-types.test.ts` 생성 (linear-capture 내)
  - [ ] 테스트: instruction 필드가 AnalysisContext에 존재하는지 TypeScript 타입 체크
  - [ ] `npm test` → FAIL (타입 불일치)

  **GREEN**:
  - [ ] Worker의 types.ts에 `instruction?: string` 추가
  - [ ] Worker의 index.ts AnalysisRequest에 `instruction?: string` 추가
  - [ ] `npm test` → PASS

  **Commit**: YES
  - Message: `feat(worker): add instruction field to request types`
  - Files: `linear-capture-worker/src/prompts/types.ts`, `linear-capture-worker/src/index.ts`

---

- [x] 3. Worker 프롬프트에 instruction 포함

  **What to do**:
  - `buildImagePrompt()` 함수가 context.instruction을 프롬프트에 포함하도록 수정
  - instruction이 있으면 "## 사용자 요청\n{instruction}" 섹션 추가
  - `analyzeWithGemini()`, `analyzeWithHaiku()`에서 instruction 전달

  **Must NOT do**:
  - 기존 프롬프트 구조 대폭 변경
  - instruction 필수화

  **Parallelizable**: NO (Task 2 이후)

  **References**:

  **Pattern References**:
  - `linear-capture-worker/src/prompts/issue-prompt.ts:108-122` - buildImagePrompt 함수
  - `linear-capture-worker/src/prompts/issue-prompt.ts:58-92` - buildContextSection 함수 (패턴 참고)
  - `linear-capture-worker/src/index.ts:222-268` - analyzeWithGemini 함수
  - `linear-capture-worker/src/index.ts:270-320` - analyzeWithHaiku 함수

  **Acceptance Criteria**:

  **RED**:
  - [ ] `src/__tests__/worker-prompt.test.ts` 생성
  - [ ] 테스트: buildImagePrompt(1, { instruction: "버튼 버그" })가 "버튼 버그" 포함하는지
  - [ ] `npm test` → FAIL

  **GREEN**:
  - [ ] buildImagePrompt()에 instruction 섹션 추가 로직 구현
  - [ ] `npm test` → PASS

  **Manual Verification**:
  - [ ] Worker 로컬 실행: `cd linear-capture-worker && npm run dev`
  - [ ] curl 테스트:
    ```bash
    curl -X POST http://localhost:8787 \
      -H "Content-Type: application/json" \
      -d '{"images":[{"data":"...base64...","mimeType":"image/png"}],"context":{"instruction":"테스트 힌트"}}'
    ```
  - [ ] 응답에 hint가 반영되었는지 확인 (description에 관련 내용)

  **Commit**: YES
  - Message: `feat(worker): include instruction in AI prompt`
  - Files: `linear-capture-worker/src/prompts/issue-prompt.ts`, `linear-capture-worker/src/index.ts`

---

- [x] 4. Worker 배포

  **What to do**:
  - Worker 배포: `cd linear-capture-worker && npm run deploy`
  - 배포된 Worker 엔드포인트 테스트

  **Must NOT do**:
  - 환경변수 변경
  - wrangler.toml 수정

  **Parallelizable**: NO (Task 3 이후)

  **References**:

  **Pattern References**:
  - `linear-capture-worker/wrangler.toml` - 배포 설정
  - `linear-capture-worker/package.json` - deploy 스크립트

  **Acceptance Criteria**:

  **Manual Verification**:
  - [ ] `cd linear-capture-worker && npm run deploy` 실행
  - [ ] 배포 URL 확인: `https://linear-capture-ai.ny-4f1.workers.dev`
  - [ ] curl로 instruction 포함 요청 테스트 (실제 이미지 필요 없이 에러 응답 확인)

  **Commit**: NO (배포만)

---

### App 수정 (linear-capture)

- [x] 5. App 서비스에 instruction 필드 추가

  **What to do**:
  - `src/services/anthropic-analyzer.ts`의 AnalysisContext에 `instruction?: string` 추가
  - `src/services/gemini-analyzer.ts`의 AnalysisContext에 `instruction?: string` 추가
  - `callWorker()` 메서드에서 requestBody에 instruction 포함

  **Must NOT do**:
  - Worker URL 변경
  - 기존 로직 변경

  **Parallelizable**: NO (Task 4 이후 - Worker 배포 완료 필요)

  **References**:

  **Pattern References**:
  - `src/services/anthropic-analyzer.ts:18` - AnalysisContext 인터페이스 (대략적 위치)
  - `src/services/gemini-analyzer.ts` - 동일 패턴
  - `src/services/anthropic-analyzer.ts:74` - callWorker 메서드의 requestBody 구성

  **Acceptance Criteria**:

  **RED**:
  - [ ] `src/__tests__/analyzer.test.ts` 생성
  - [ ] 테스트: AnalysisContext에 instruction 필드 타입 체크
  - [ ] `npm test` → FAIL

  **GREEN**:
  - [ ] 두 analyzer 파일에 instruction 필드 추가
  - [ ] callWorker requestBody에 instruction 포함
  - [ ] `npm test` → PASS

  **Commit**: YES
  - Message: `feat(app): add instruction field to analyzer services`
  - Files: `src/services/anthropic-analyzer.ts`, `src/services/gemini-analyzer.ts`

---

- [x] 6. App IPC 핸들러에 instruction 전달

  **What to do**:
  - `reanalyze` IPC 핸들러가 data.instruction을 받아서 analyzer에 전달
  - analysisContext에 instruction 추가

  **Must NOT do**:
  - 다른 IPC 핸들러 수정
  - 캡처 로직 변경

  **Parallelizable**: NO (Task 5 이후)

  **References**:

  **Pattern References**:
  - `src/main/index.ts:567` - reanalyze IPC 핸들러
  - `src/main/index.ts:572-580` - analysisContext 구성 패턴

  **Acceptance Criteria**:

  **RED**:
  - [ ] `src/__tests__/ipc-handler.test.ts` 생성
  - [ ] 테스트: reanalyze 핸들러가 instruction을 context에 포함하는지 (mock 사용)
  - [ ] `npm test` → FAIL

  **GREEN**:
  - [ ] IPC 핸들러에서 data.instruction 추출
  - [ ] analysisContext.instruction = data.instruction 추가
  - [ ] `npm test` → PASS

  **Commit**: YES
  - Message: `feat(app): pass instruction through IPC handler`
  - Files: `src/main/index.ts`

---

- [x] 7. App UI에 힌트 textarea 추가

  **What to do**:
  - `src/renderer/index.html`에 textarea 추가 (갤러리 아래, 모델 선택 위)
  - placeholder: "집중할 내용을 입력하세요 (선택사항)"
  - "분석 시작" 버튼 클릭 시 textarea 값을 IPC 호출에 포함
  - 새 캡처 세션 시 textarea 초기화

  **Must NOT do**:
  - 글자 수 카운터 추가
  - 힌트 저장 기능
  - 버튼 라벨 변경

  **Parallelizable**: NO (Task 6 이후)

  **References**:

  **Pattern References**:
  - `src/renderer/index.html:781` - imageGallery div
  - `src/renderer/index.html:786-797` - 모델 선택 및 분석 버튼 영역
  - `src/renderer/index.html:1827` - reanalyzeBtn 클릭 핸들러
  - `src/renderer/index.html:804` - issueForm 스타일 참고

  **Acceptance Criteria**:

  **Manual Verification (Playwright)**:
  - [ ] `npm run start`로 앱 실행
  - [ ] 캡처 후 갤러리 아래에 textarea 표시 확인
  - [ ] placeholder 텍스트: "집중할 내용을 입력하세요 (선택사항)"
  - [ ] 힌트 입력 후 "분석 시작" 클릭 → 분석 결과에 힌트 내용 반영
  - [ ] 새 캡처 시 textarea 초기화 확인
  - [ ] 빈 힌트로 분석 → 기존과 동일하게 동작

  **Commit**: YES
  - Message: `feat(app): add hint textarea UI for user instructions`
  - Files: `src/renderer/index.html`

---

### Integration & Finalization

- [x] 8. 통합 테스트

  **What to do**:
  - 전체 흐름 테스트: 캡처 → 힌트 입력 → 분석 → 결과 확인
  - 빈 힌트 regression 테스트
  - 모든 테스트 통과 확인

  **Must NOT do**:
  - 새로운 기능 추가
  - 버그 아닌 것 수정

  **Parallelizable**: NO (Task 7 이후)

  **References**:

  **Pattern References**:
  - 모든 이전 작업 결과물

  **Acceptance Criteria**:

  **Manual Verification**:
  - [ ] `npm test` → 모든 테스트 PASS
  - [ ] `npm run build` → 빌드 성공
  - [ ] 앱 실행 후 전체 흐름 테스트:
    1. ⌘+Shift+L로 캡처
    2. 힌트 입력: "버튼 색상 문제"
    3. "분석 시작" 클릭
    4. 결과에 "버튼" 또는 "색상" 관련 내용 포함 확인
  - [ ] 빈 힌트 테스트:
    1. 새 캡처
    2. 힌트 비우기
    3. "분석 시작" 클릭
    4. 기존처럼 자동 분석 결과 확인

  **Commit**: NO (테스트만)

---

- [x] 9. 최종 커밋 및 머지 준비

  **What to do**:
  - 모든 변경사항 확인
  - 최종 테스트 실행
  - PR 생성 또는 main 머지

  **Must NOT do**:
  - 버전 범프 (별도 작업)
  - Worker 재배포 (이미 완료)

  **Parallelizable**: NO (마지막 작업)

  **References**:

  **Pattern References**:
  - 프로젝트 Git 워크플로우

  **Acceptance Criteria**:

  **Manual Verification**:
  - [ ] `git status` → 모든 파일 커밋됨
  - [ ] `git log --oneline` → 커밋 히스토리 확인
  - [ ] PR 생성 또는 `git checkout main && git merge feature/user-hint`

  **Commit**: YES (머지 커밋)
  - Message: `Merge branch 'feature/user-hint' into main`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `chore: setup vitest test infrastructure` | vitest.config.ts, package.json, src/__tests__/example.test.ts | npm test |
| 2 | `feat(worker): add instruction field to request types` | worker/src/prompts/types.ts, worker/src/index.ts | npm test |
| 3 | `feat(worker): include instruction in AI prompt` | worker/src/prompts/issue-prompt.ts, worker/src/index.ts | npm test |
| 5 | `feat(app): add instruction field to analyzer services` | src/services/*.ts | npm test |
| 6 | `feat(app): pass instruction through IPC handler` | src/main/index.ts | npm test |
| 7 | `feat(app): add hint textarea UI for user instructions` | src/renderer/index.html | npm run build |

---

## Success Criteria

### Verification Commands
```bash
# 테스트 실행
npm test  # Expected: All tests pass

# 빌드 확인
npm run build  # Expected: No errors

# 앱 실행
npm start  # Expected: App launches with hint textarea visible
```

### Final Checklist
- [x] 모든 "Must Have" 기능 구현됨
- [x] 모든 "Must NOT Have" 항목 없음
- [x] 모든 테스트 통과
- [x] Worker 배포 완료
- [x] 빈 힌트 regression 없음
