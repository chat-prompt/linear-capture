# i18n AI Analysis Output

## TL;DR

> **Quick Summary**: AI 분석 결과(이슈 제목/본문)가 사용자 선택 언어로 출력되도록 앱과 Worker를 수정
> 
> **Deliverables**:
> - 앱: `language` 파라미터를 Worker로 전달
> - Worker: 언어에 따라 AI 출력 언어 동적 변경
> - Worker 배포: 변경사항 wrangler deploy
> 
> **Estimated Effort**: Medium (앱 + Worker 두 저장소 수정)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5

---

## Context

### Original Request
> 지금까지 영어 / 한국어 다국어 처리를 UI로는 잘 했는데, 캡처 > 분석 후 이슈로 생성되는 제목 및 본문은 무조건 한국어로 나오고 있어. 영어를 선택했으면 영어로 나오게끔 되어야해. {selected language}를 프롬프트에 전달해서 해당 선택 언어로 결과가 나오게 계획을 짜줘.

### Interview Summary
**Key Discussions**:
- Worker 코드 수정도 이 계획에 포함 (별도 저장소 linear-capture-worker)
- ISO 639-1 언어 코드 사용 (en, ko 등 2자리)
- language 파라미터는 앱이 항상 보내므로 없는 케이스는 고려 불필요
- Worker 배포까지 계획에 포함

**Research Findings**:
- 앱: `getCurrentLanguage()` 함수가 `src/main/i18n.ts`에 존재
- 앱: `SUPPORTED_LANGUAGES = ['en', 'ko']` 이미 정의됨
- Worker: `src/prompts/issue-prompt.ts`의 `TITLE_RULES`, `DESCRIPTION_TEMPLATE`이 한국어로 하드코딩
- Worker: `buildImagePrompt()`, `buildTextPrompt()` 함수에서 프롬프트 생성

### Metis Review
**Identified Gaps** (addressed):
- Fallback behavior → 앱이 항상 language를 보내므로 불필요
- Prompt approach → Dynamic instruction 방식 채택 (확장성)
- Worker deployment → 계획에 포함
- buildTextPrompt() → 동일하게 수정 필요 (확인됨)

---

## Work Objectives

### Core Objective
사용자가 앱에서 선택한 언어(en/ko)로 AI 분석 결과(이슈 제목/본문)가 출력되도록 함

### Concrete Deliverables
- `src/services/anthropic-analyzer.ts`: `language` 필드 추가 및 전달
- `src/services/gemini-analyzer.ts`: 동일
- `src/main/index.ts`: 분석 호출 시 `getCurrentLanguage()` 값 전달
- Worker `src/prompts/types.ts`: `PromptContext`에 `language` 필드 추가
- Worker `src/index.ts`: `language` 파라미터 수신 및 전달
- Worker `src/prompts/issue-prompt.ts`: 동적 언어 지시 추가
- Worker 배포 완료

### Definition of Done
- [ ] 영어 설정 시 AI 분석 결과가 영어로 출력됨
- [ ] 한국어 설정 시 AI 분석 결과가 한국어로 출력됨
- [ ] 기존 기능에 regression 없음

### Must Have
- `language` 파라미터가 앱 → Worker로 전달됨
- Worker가 `language`에 따라 출력 언어를 변경함
- Worker 배포 완료

### Must NOT Have (Guardrails)
- 프롬프트 전체 번역 (Dynamic instruction 방식 사용)
- user-provided `instruction` 텍스트 번역
- 새로운 Worker 엔드포인트 추가
- 에러 메시지 다국어화 (OUT OF SCOPE)

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: NO (vitest 있으나 이 기능의 E2E 테스트는 수동)
- **User wants tests**: Manual verification
- **Framework**: N/A

### Automated Verification

**Worker API 테스트** (using Bash curl):
```bash
# Test 1: English output
curl -s -X POST https://linear-capture-ai.ny-4f1.workers.dev/analyze \
  -H "Content-Type: application/json" \
  -d '{"images":[{"data":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==","mimeType":"image/png"}],"language":"en"}' \
| jq -r '.title'
# Assert: Does NOT contain Korean characters [가-힣]

# Test 2: Korean output
curl -s -X POST https://linear-capture-ai.ny-4f1.workers.dev/analyze \
  -H "Content-Type: application/json" \
  -d '{"images":[{"data":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==","mimeType":"image/png"}],"language":"ko"}' \
| jq -r '.title'
# Assert: Response is valid JSON (Korean is default behavior)
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1: 앱 - AnalysisContext 인터페이스 수정
└── Task 2: Worker - PromptContext 및 AnalysisRequest 수정

Wave 2 (After Wave 1):
├── Task 3: 앱 - main/index.ts에서 language 전달
└── Task 4: Worker - buildImagePrompt/buildTextPrompt 수정

Wave 3 (After Wave 2):
└── Task 5: Worker 배포 및 E2E 테스트

Critical Path: Task 1 → Task 3 → Task 5
Parallel Speedup: ~30% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 3 | 2 |
| 2 | None | 4 | 1 |
| 3 | 1 | 5 | 4 |
| 4 | 2 | 5 | 3 |
| 5 | 3, 4 | None | None (final) |

### Agent Dispatch Summary

| Wave | Tasks | Recommended Agents |
|------|-------|-------------------|
| 1 | 1, 2 | delegate_task(category="quick", load_skills=[], run_in_background=true) |
| 2 | 3, 4 | dispatch parallel after Wave 1 completes |
| 3 | 5 | final deployment task |

---

## TODOs

- [ ] 1. [앱] AnalysisContext 인터페이스에 language 필드 추가

  **What to do**:
  - `src/services/anthropic-analyzer.ts`의 `AnalysisContext` 인터페이스에 `language: string` 필드 추가
  - `src/services/gemini-analyzer.ts`의 `AnalysisContext` 인터페이스에 동일하게 추가
  - `callWorker()` 함수의 `requestBody`에 `language` 필드 포함

  **Must NOT do**:
  - language를 optional로 만들지 않음 (앱이 항상 보냄)
  - 기존 필드 제거하지 않음

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단순 인터페이스 필드 추가, 2개 파일의 동일한 수정
  - **Skills**: []
    - 기본 TypeScript 수정, 특별한 스킬 불필요

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Task 3
  - **Blocked By**: None (can start immediately)

  **References**:
  - `src/services/anthropic-analyzer.ts:18-23` - AnalysisContext 인터페이스 정의
  - `src/services/anthropic-analyzer.ts:85-93` - requestBody 구성 부분
  - `src/services/gemini-analyzer.ts:18-23` - 동일한 인터페이스 (중복 정의됨)
  - `src/services/gemini-analyzer.ts:88-96` - 동일한 requestBody 구성

  **Acceptance Criteria**:
  ```bash
  # 파일 수정 확인
  grep -n "language:" src/services/anthropic-analyzer.ts
  # Assert: AnalysisContext 인터페이스에 language: string 포함
  
  grep -n "language:" src/services/gemini-analyzer.ts
  # Assert: 동일하게 포함

  grep -n "language:" src/services/anthropic-analyzer.ts | grep requestBody
  # Assert: requestBody에 language 필드 포함
  ```

  **Commit**: YES
  - Message: `feat(analyzer): add language field to AnalysisContext`
  - Files: `src/services/anthropic-analyzer.ts`, `src/services/gemini-analyzer.ts`

---

- [ ] 2. [Worker] PromptContext 및 AnalysisRequest에 language 필드 추가

  **What to do**:
  - `src/prompts/types.ts`의 `PromptContext` 인터페이스에 `language?: string` 추가
  - `src/index.ts`의 `AnalysisRequest` 인터페이스에 `language?: string` 추가
  - `analyzeWithGemini`, `analyzeWithHaiku` 함수에서 `language`를 context에 포함

  **Must NOT do**:
  - 새로운 엔드포인트 추가하지 않음
  - 기존 API 계약 변경하지 않음 (language는 optional로 유지하여 구버전 앱 호환)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 인터페이스 필드 추가, 파라미터 전달 로직만 수정
  - **Skills**: []
    - 기본 TypeScript 수정

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Task 4
  - **Blocked By**: None (can start immediately)

  **References**:
  - Worker: `src/prompts/types.ts:1-5` - PromptContext 인터페이스
  - Worker: `src/index.ts:33-41` - AnalysisRequest 인터페이스
  - Worker: `src/index.ts:460-507` - analyzeWithGemini 함수
  - Worker: `src/index.ts:509-560` - analyzeWithHaiku 함수

  **Acceptance Criteria**:
  ```bash
  # Worker 디렉토리에서 실행
  grep -n "language" src/prompts/types.ts
  # Assert: PromptContext에 language?: string 포함
  
  grep -n "language" src/index.ts | head -10
  # Assert: AnalysisRequest에 language 필드 포함
  ```

  **Commit**: YES
  - Message: `feat(worker): add language field to request interfaces`
  - Files: `src/prompts/types.ts`, `src/index.ts`

---

- [ ] 3. [앱] main/index.ts에서 분석 호출 시 language 전달

  **What to do**:
  - `src/main/index.ts`의 `reanalyze` IPC 핸들러에서 `analysisContext`에 `language` 필드 추가
  - `getCurrentLanguage()`를 import하여 현재 언어 값 사용
  - 초기 캡처 시 자동 분석 로직에도 동일하게 적용 (있다면)

  **Must NOT do**:
  - renderer에서 language를 별도로 받지 않음 (main process에서 관리)
  - 하드코딩된 언어 값 사용하지 않음

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: IPC 핸들러에 필드 추가, import 추가
  - **Skills**: []
    - 기본 TypeScript 수정

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 4)
  - **Blocks**: Task 5
  - **Blocked By**: Task 1

  **References**:
  - `src/main/index.ts:10` - i18n import 위치 (getCurrentLanguage 추가 필요)
  - `src/main/index.ts:720-773` - reanalyze IPC 핸들러
  - `src/main/index.ts:726-735` - analysisContext 구성 부분
  - `src/main/i18n.ts:55-57` - getCurrentLanguage() 함수 정의

  **Acceptance Criteria**:
  ```bash
  # import 확인
  grep -n "getCurrentLanguage" src/main/index.ts
  # Assert: getCurrentLanguage가 import되어 있음
  
  # analysisContext에 language 포함 확인
  grep -A 10 "const analysisContext" src/main/index.ts | grep language
  # Assert: language: getCurrentLanguage() 포함
  ```

  **Commit**: YES
  - Message: `feat(main): pass current language to AI analyzer`
  - Files: `src/main/index.ts`

---

- [ ] 4. [Worker] buildImagePrompt/buildTextPrompt에 동적 언어 지시 추가

  **What to do**:
  - `src/prompts/issue-prompt.ts`에 `getLanguageInstruction()` 헬퍼 함수 추가
  - `buildImagePrompt()`에서 `context?.language` 확인 후 영어면 영어 지시 추가
  - `buildTextPrompt()`에도 동일하게 적용
  - 한국어('ko')는 기존 동작 유지 (추가 지시 없음)

  **Dynamic Instruction 구현**:
  ```typescript
  function getLanguageInstruction(language?: string): string {
    if (!language || language === 'ko') return ''; // Korean is default
    
    const langNames: Record<string, string> = {
      en: 'English',
      ko: 'Korean',
      // 추후 확장: ja: 'Japanese', zh: 'Chinese', etc.
    };
    
    const langName = langNames[language] || 'English';
    return `**IMPORTANT: Write ALL output (title and description) in ${langName}. Do NOT use Korean.**\n\n`;
  }
  ```

  **Must NOT do**:
  - TITLE_RULES, DESCRIPTION_TEMPLATE을 번역하지 않음
  - 프롬프트 전체를 언어별로 분기하지 않음

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 헬퍼 함수 추가 및 프롬프트 앞에 지시 삽입
  - **Skills**: []
    - 기본 TypeScript 수정

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: Task 5
  - **Blocked By**: Task 2

  **References**:
  - Worker: `src/prompts/issue-prompt.ts:114-144` - buildImagePrompt 함수
  - Worker: `src/prompts/issue-prompt.ts:146-174` - buildTextPrompt 함수
  - Worker: `src/prompts/issue-prompt.ts:58-70` - buildInstructionSection 패턴 참고

  **Acceptance Criteria**:
  ```bash
  # 헬퍼 함수 존재 확인
  grep -n "getLanguageInstruction" src/prompts/issue-prompt.ts
  # Assert: 함수 정의 존재
  
  # buildImagePrompt에서 호출 확인
  grep -A 5 "function buildImagePrompt" src/prompts/issue-prompt.ts | grep language
  # Assert: language 관련 로직 포함
  ```

  **Commit**: YES
  - Message: `feat(prompts): add dynamic language instruction for multi-lang output`
  - Files: `src/prompts/issue-prompt.ts`

---

- [ ] 5. [Worker] 배포 및 E2E 테스트

  **What to do**:
  - Worker 디렉토리에서 `npx wrangler deploy` 실행
  - 배포 성공 확인
  - curl로 영어/한국어 API 테스트 실행

  **Must NOT do**:
  - 다른 환경(staging 등)에 배포하지 않음
  - 기존 secrets 변경하지 않음

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 배포 명령 실행 및 curl 테스트
  - **Skills**: []
    - 기본 CLI 실행

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (final)
  - **Blocks**: None
  - **Blocked By**: Task 3, Task 4

  **References**:
  - Worker: `wrangler.toml` - 배포 설정
  - Worker URL: `https://linear-capture-ai.ny-4f1.workers.dev`

  **Acceptance Criteria**:
  ```bash
  # Worker 디렉토리에서 배포
  cd /Users/wine_ny/side-project/linear_project/linear-capture-worker
  npx wrangler deploy
  # Assert: "Published" 메시지 출력
  
  # 영어 테스트 (1x1 투명 PNG)
  curl -s -X POST https://linear-capture-ai.ny-4f1.workers.dev \
    -H "Content-Type: application/json" \
    -d '{"images":[{"data":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==","mimeType":"image/png"}],"language":"en"}' \
  | jq '.success'
  # Assert: true
  
  # 한국어 테스트
  curl -s -X POST https://linear-capture-ai.ny-4f1.workers.dev \
    -H "Content-Type: application/json" \
    -d '{"images":[{"data":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==","mimeType":"image/png"}],"language":"ko"}' \
  | jq '.success'
  # Assert: true
  ```

  **Commit**: NO (배포는 커밋 대상 아님)

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(analyzer): add language field to AnalysisContext` | anthropic-analyzer.ts, gemini-analyzer.ts | grep language |
| 2 | `feat(worker): add language field to request interfaces` | types.ts, index.ts | grep language |
| 3 | `feat(main): pass current language to AI analyzer` | index.ts | grep getCurrentLanguage |
| 4 | `feat(prompts): add dynamic language instruction for multi-lang output` | issue-prompt.ts | grep getLanguageInstruction |
| 5 | (배포만, 커밋 없음) | - | curl 테스트 |

---

## Success Criteria

### Verification Commands
```bash
# 앱 빌드 확인
cd /Users/wine_ny/side-project/linear_project/linear-capture-worktrees/i18n
npm run build
# Expected: 빌드 성공

# Worker API 영어 테스트
curl -s -X POST https://linear-capture-ai.ny-4f1.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"images":[{"data":"BASE64_SCREENSHOT","mimeType":"image/png"}],"language":"en"}' \
| jq -r '.title'
# Expected: 영어 제목 출력

# Worker API 한국어 테스트  
curl -s -X POST https://linear-capture-ai.ny-4f1.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"images":[{"data":"BASE64_SCREENSHOT","mimeType":"image/png"}],"language":"ko"}' \
| jq -r '.title'
# Expected: 한국어 제목 출력
```

### Final Checklist
- [ ] 모든 "Must Have" 항목 완료
- [ ] 모든 "Must NOT Have" 항목 준수
- [ ] 앱 빌드 성공
- [ ] Worker 배포 성공
- [ ] 영어/한국어 API 테스트 통과
