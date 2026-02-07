# Linear Direct Upload - R2에서 Linear SDK fileUpload로 전환

## TL;DR

> **Quick Summary**: 이미지 업로드를 Cloudflare R2 Worker에서 Linear SDK의 `fileUpload()` API로 전환하여 Worker 의존성(업로드 부분만)을 제거하고 버그를 수정
> 
> **Deliverables**:
> - `src/services/linear-uploader.ts` - Linear SDK 기반 이미지 업로더
> - `src/main/ipc-handlers.ts` 수정 - R2 → Linear 업로더로 교체
> - (선택) `src/services/r2-uploader.ts` 삭제 또는 백업 유지
> 
> **Estimated Effort**: Quick (2-3시간)
> **Parallel Execution**: NO - sequential
> **Critical Path**: Task 1 → Task 2 → Task 3

---

## Context

### Original Request
Linear Capture 앱에서 이슈 생성 시 이미지가 첨부되지 않는 버그 수정. Worker URL 변경으로 인한 문제를 근본적으로 해결하기 위해 R2 의존성을 제거하고 Linear SDK 직접 업로드로 전환.

### Interview Summary
**Key Discussions**:
- Worker URL이 `ny-4f1.workers.dev` → `kangjun-f0f.workers.dev`로 변경되어 이미지 업로드 실패
- Linear SDK `fileUpload()` API를 사용하면 Worker 없이 직접 업로드 가능
- 변경 범위가 작아서 진행하기로 결정

**Research Findings**:
- Linear SDK `fileUpload(contentType, filename, size)` 메서드 존재
- 2단계 업로드: (1) pre-signed URL 요청, (2) PUT으로 업로드
- 반환값 `assetUrl`을 마크다운에 사용

### Metis Review
**Identified Gaps** (addressed):
- Worker 의존성 완전 제거 불가 → AI 분석기는 유지, 업로드만 제거
- 변경 범위 과소평가 → 5-10줄로 조정
- Edge cases → pre-signed URL 만료, 대용량 파일 처리 추가

---

## Work Objectives

### Core Objective
이미지 업로드 방식을 R2 Worker에서 Linear SDK `fileUpload()`로 전환하여 버그 수정 및 아키텍처 단순화

### Concrete Deliverables
- `src/services/linear-uploader.ts` 신규 파일
- `src/main/ipc-handlers.ts` 업로더 교체
- 이미지가 포함된 Linear 이슈 정상 생성

### Definition of Done
- [ ] 단일 이미지 이슈 생성 시 이미지가 Linear에 표시됨
- [ ] 다중 이미지(3-5장) 이슈 생성 시 모든 이미지 표시됨
- [ ] 업로드 실패 시 적절한 에러 메시지 표시

### Must Have
- Linear SDK `fileUpload()` 사용한 업로드
- 기존 에러 처리 패턴 유지 (per-image failure 허용)
- 마크다운 이미지 포맷 유지: `![Screenshot N](url)`

### Must NOT Have (Guardrails)
- ❌ `anthropic-analyzer.ts`, `gemini-analyzer.ts` 수정 금지 (Worker 계속 사용)
- ❌ Worker URL 제거 금지 (AI 분석에 필요)
- ❌ UI 이미지 미리보기 변경 금지
- ❌ 마크다운 포맷 변경 금지
- ❌ 불필요한 리팩토링 (다른 서비스 건드리지 말 것)

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
> 
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.

### Test Decision
- **Infrastructure exists**: YES (vitest 설정됨)
- **Automated tests**: Tests-after (핵심 기능 구현 후 테스트)
- **Framework**: vitest

### Agent-Executed QA Scenarios (MANDATORY)

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| **이슈 생성** | Bash (Linear API/gh) | 이슈 description에 이미지 URL 포함 확인 |
| **앱 빌드** | Bash (npm) | `npm run pack:clean` 성공 |
| **타입 체크** | Bash (tsc) | TypeScript 컴파일 에러 없음 |

---

## Execution Strategy

### Sequential Execution (No Parallel Waves)

```
Task 1: LinearUploader 서비스 생성
    ↓
Task 2: IPC 핸들러에서 업로더 교체
    ↓
Task 3: 통합 테스트 및 검증
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|------------|--------|
| 1 | None | 2 |
| 2 | 1 | 3 |
| 3 | 2 | None |

---

## TODOs

- [ ] 1. LinearUploader 서비스 생성

  **What to do**:
  - `src/services/linear-uploader.ts` 파일 생성
  - `LinearUploader` 클래스 구현:
    - `upload(filePath: string): Promise<UploadResult>` 메서드
    - `uploadMultiple(filePaths: string[]): Promise<MultiUploadResult>` 메서드
  - Linear SDK `fileUpload()` API 호출
  - PUT 요청으로 pre-signed URL에 업로드
  - `assetUrl` 반환

  **Must NOT do**:
  - LinearService 클래스 수정 (별도 클래스로 분리)
  - 기존 r2-uploader.ts 삭제 (백업 유지)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단일 파일 생성, 명확한 API 사용
  - **Skills**: [`git-master`]
    - `git-master`: 커밋 작성 시 필요

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:

  **Pattern References** (existing code to follow):
  - `src/services/r2-uploader.ts:20-83` - 기존 업로더 인터페이스 및 에러 처리 패턴 (UploadResult, MultiUploadResult 타입 재사용)
  - `src/services/linear-client.ts:80-86` - LinearClient 인스턴스 생성 패턴
  - `src/services/settings-store.ts:getLinearToken()` - API 토큰 가져오기

  **API/Type References**:
  - `src/services/r2-uploader.ts:8-18` - UploadResult, MultiUploadResult 인터페이스 (동일하게 사용)

  **External References**:
  - Linear SDK fileUpload: https://github.com/linear/linear/blob/master/packages/sdk/src/_generated_sdk.ts
  - Linear 파일 업로드 가이드: https://linear.app/developers/how-to-upload-a-file-to-linear

  **WHY Each Reference Matters**:
  - r2-uploader.ts: 동일한 인터페이스를 유지해야 ipc-handlers.ts 변경이 최소화됨
  - linear-client.ts: LinearClient 생성 방식 참고
  - settings-store.ts: 토큰 접근 방식 일관성 유지

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: TypeScript 컴파일 성공
    Tool: Bash (tsc)
    Preconditions: linear-uploader.ts 파일 생성 완료
    Steps:
      1. npx tsc --noEmit
      2. Assert: exit code 0
      3. Assert: no errors in output
    Expected Result: 컴파일 에러 없음
    Evidence: Terminal output captured

  Scenario: 인터페이스 호환성 확인
    Tool: Bash (grep)
    Preconditions: 파일 생성 완료
    Steps:
      1. grep -c "UploadResult" src/services/linear-uploader.ts
      2. Assert: count >= 1
      3. grep -c "uploadMultiple" src/services/linear-uploader.ts
      4. Assert: count >= 1
    Expected Result: R2Uploader와 동일한 인터페이스 제공
    Evidence: grep output captured
  ```

  **Commit**: YES
  - Message: `feat(upload): add LinearUploader service using SDK fileUpload API`
  - Files: `src/services/linear-uploader.ts`
  - Pre-commit: `npx tsc --noEmit`

---

- [ ] 2. IPC 핸들러에서 업로더 교체

  **What to do**:
  - `src/main/ipc-handlers.ts` 수정
  - `createR2UploaderFromEnv()` → `createLinearUploaderFromEnv()` 교체
  - import 문 변경
  - 나머지 로직은 그대로 유지 (동일 인터페이스)

  **Must NOT do**:
  - 에러 처리 로직 변경
  - 이미지 URL을 description에 추가하는 로직 변경
  - 다른 IPC 핸들러 수정

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단순 교체 작업, 3-5줄 변경
  - **Skills**: [`git-master`]
    - `git-master`: 커밋 작성

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/main/ipc-handlers.ts:4` - R2Uploader import 위치
  - `src/main/ipc-handlers.ts:132-163` - create-issue 핸들러 내 업로드 로직

  **WHY Each Reference Matters**:
  - 132-163줄: R2Uploader가 사용되는 정확한 위치, 여기만 변경하면 됨

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 빌드 성공 확인
    Tool: Bash (npm)
    Preconditions: Task 1 완료, ipc-handlers.ts 수정 완료
    Steps:
      1. npm run build
      2. Assert: exit code 0
      3. ls -la dist/main/ipc-handlers.js
      4. Assert: file exists
    Expected Result: TypeScript 빌드 성공
    Evidence: Build output captured

  Scenario: R2Uploader 참조 제거 확인
    Tool: Bash (grep)
    Preconditions: 수정 완료
    Steps:
      1. grep -c "R2Uploader" src/main/ipc-handlers.ts
      2. Assert: count = 0
      3. grep -c "LinearUploader" src/main/ipc-handlers.ts
      4. Assert: count >= 1
    Expected Result: R2 참조 제거, Linear 참조 추가
    Evidence: grep output captured
  ```

  **Commit**: YES
  - Message: `refactor(upload): switch from R2Uploader to LinearUploader in IPC handler`
  - Files: `src/main/ipc-handlers.ts`
  - Pre-commit: `npm run build`

---

- [ ] 3. 통합 테스트 및 검증

  **What to do**:
  - `npm run pack:clean`으로 앱 빌드 및 실행
  - 실제로 이슈 생성하여 이미지 첨부 확인
  - 다중 이미지 테스트 (최소 2장)

  **Must NOT do**:
  - 코드 추가 변경 (버그 발견 시 별도 커밋)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 검증 작업
  - **Skills**: [`playwright`]
    - `playwright`: 앱 UI 자동화 테스트 가능성

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (final)
  - **Blocks**: None
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `CLAUDE.md:테스트 원칙` - `npm run pack:clean` 사용 필수
  - `package.json:17` - pack:clean 스크립트 정의

  **WHY Each Reference Matters**:
  - CLAUDE.md: 개발 모드가 아닌 패키징된 앱으로 테스트해야 함

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 앱 빌드 성공
    Tool: Bash (npm)
    Preconditions: Task 2 완료
    Steps:
      1. npm run pack
      2. Assert: exit code 0
      3. ls -la "release/mac-arm64/Linear Capture.app"
      4. Assert: directory exists
    Expected Result: 앱 패키징 성공
    Evidence: Build output + directory listing

  Scenario: 이미지 업로드 기능 동작 (수동 확인 필요)
    Tool: Manual verification
    Preconditions: 앱 빌드 완료
    Steps:
      1. open "release/mac-arm64/Linear Capture.app"
      2. Cmd+Shift+L로 캡처
      3. "Create Issue" 클릭
      4. Linear 웹에서 이슈 확인
      5. 이미지가 description에 마크다운으로 포함되어 있고 렌더링됨
    Expected Result: 이미지가 Linear 이슈에 표시됨
    Evidence: Linear 이슈 URL 기록

  Scenario: 업로드 로그 확인
    Tool: Bash (앱 로그)
    Preconditions: 이슈 생성 시도
    Steps:
      1. 앱 개발자 도구에서 콘솔 확인
      2. "Uploading" 또는 "fileUpload" 관련 로그 확인
      3. 에러 로그 없음 확인
    Expected Result: 업로드 성공 로그
    Evidence: Console output screenshot
  ```

  **Commit**: NO (검증만)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(upload): add LinearUploader service using SDK fileUpload API` | linear-uploader.ts | tsc --noEmit |
| 2 | `refactor(upload): switch from R2Uploader to LinearUploader` | ipc-handlers.ts | npm run build |
| 3 | (no commit) | - | npm run pack |

---

## Success Criteria

### Verification Commands
```bash
# TypeScript 컴파일
npx tsc --noEmit  # Expected: no errors

# 빌드
npm run build     # Expected: exit 0

# 패키징
npm run pack      # Expected: .app 생성
```

### Final Checklist
- [ ] LinearUploader가 R2Uploader와 동일한 인터페이스 제공
- [ ] IPC 핸들러에서 LinearUploader 사용
- [ ] 앱 빌드 성공
- [ ] 이미지가 Linear 이슈에 첨부됨
- [ ] AI 분석기(Worker) 영향 없음

---

## Rollback Plan

문제 발생 시:
1. `git revert` 또는 `git checkout`으로 r2-uploader 사용 코드로 복원
2. r2-uploader.ts는 삭제하지 않고 유지하므로 즉시 롤백 가능
