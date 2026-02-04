# i18n 완전 분리 - 다국어 이슈 생성 수정

## TL;DR

> **Quick Summary**: Worker 프롬프트에서 언어별 완전 분리 적용. 하드코딩된 한국어 제거하고 명시적 언어 출력 지시 추가.
> 
> **Deliverables**:
> - 템플릿 인터페이스 확장 (`jsonFormatHeader`, `outputLanguageInstruction`)
> - 5개 언어 템플릿 완성 (en, ko, de, fr, es)
> - 프롬프트 빌더 수정 (하드코딩 제거)
> 
> **Estimated Effort**: Short
> **Parallel Execution**: NO - sequential (파일 의존성)
> **Critical Path**: templates/index.ts → 언어별 ts → issue-prompt.ts

---

## Context

### Original Request
다국어 처리 시 영어/한국어는 잘 되는데 de/fr/es는 불안정. 영어→한국어→영어 전환 시 혼합 출력 문제.

### Interview Summary
**Key Discussions**:
- 언어 선택 시 해당 언어 프롬프트 전체를 가져오는 방식으로 변경
- 하나의 프롬프트로 5개 언어 처리 ❌ → 언어별 완전 분리 ✅

**Research Findings**:
- `issue-prompt.ts`에 `## JSON 응답 형식 (마크다운 코드블록 없이):` 한국어 하드코딩 발견
- AI에게 명시적 언어 출력 지시 없음
- `getTemplates(language)` 함수는 있으나 불완전하게 사용됨

---

## Work Objectives

### Core Objective
언어 선택 시 해당 언어의 프롬프트가 100% 적용되어 혼합 없이 출력되도록 수정

### Concrete Deliverables
- `linear-capture-worker/src/prompts/templates/index.ts` 수정
- `linear-capture-worker/src/prompts/templates/{en,ko,de,fr,es}.ts` 수정
- `linear-capture-worker/src/prompts/issue-prompt.ts` 수정

### Definition of Done
- [ ] 영어 설정 → 100% 영어 출력
- [ ] 한국어 설정 → 100% 한국어 출력
- [ ] 언어 전환 후 재생성 → 혼합 없음
- [ ] Worker 배포 완료

### Must Have
- 명시적 언어 출력 지시 (`outputLanguageInstruction`)
- JSON 형식 안내 다국어화 (`jsonFormatHeader`)
- 하드코딩된 한국어 완전 제거

### Must NOT Have (Guardrails)
- 프롬프트에 하드코딩된 특정 언어 문자열
- 언어 혼합 가능성 있는 구조

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (Worker는 별도 테스트 인프라 없음)
- **User wants tests**: Manual verification
- **QA approach**: curl 또는 앱에서 직접 테스트

### Manual Verification Procedure
```bash
# 1. Worker 로컬 테스트
cd linear-capture-worker
wrangler dev

# 2. curl로 언어별 테스트
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"images":[{"data":"...", "mimeType":"image/png"}], "language":"en", "model":"gemini"}'

# 3. 응답에서 title, description이 100% 영어인지 확인
```

---

## Execution Strategy

### Sequential Execution (의존성 있음)

```
Task 1: templates/index.ts 수정 (인터페이스 확장)
    ↓
Task 2: 5개 언어 템플릿 완성 (en, ko, de, fr, es)
    ↓
Task 3: issue-prompt.ts 수정 (하드코딩 제거 + 템플릿 사용)
    ↓
Task 4: Worker 배포 및 검증
```

---

## TODOs

- [ ] 1. PromptTemplates 인터페이스 확장

  **What to do**:
  - `templates/index.ts`의 `PromptTemplates` 인터페이스에 필드 추가:
    - `jsonFormatHeader: string`
    - `outputLanguageInstruction: string`

  **Must NOT do**:
  - 기존 필드 제거 또는 변경

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 2, 3

  **References**:
  - `linear-capture-worker/src/prompts/templates/index.ts:1-37` - 현재 인터페이스 정의

  **Acceptance Criteria**:
  - [ ] `jsonFormatHeader` 필드 추가됨
  - [ ] `outputLanguageInstruction` 필드 추가됨
  - [ ] TypeScript 컴파일 에러 없음

  **Commit**: YES
  - Message: `feat(i18n): extend PromptTemplates interface with language fields`
  - Files: `templates/index.ts`

---

- [ ] 2. 5개 언어 템플릿 완성

  **What to do**:
  - 각 언어 파일에 새 필드 값 추가:

  **en.ts**:
  ```typescript
  jsonFormatHeader: 'JSON response format (without markdown code blocks):',
  outputLanguageInstruction: 'CRITICAL: You MUST write the title and description in English only. Do not use any other language.',
  ```

  **ko.ts**:
  ```typescript
  jsonFormatHeader: 'JSON 응답 형식 (마크다운 코드블록 없이):',
  outputLanguageInstruction: '중요: 제목과 설명은 반드시 한국어로만 작성하세요. 다른 언어를 사용하지 마세요.',
  ```

  **de.ts**:
  ```typescript
  jsonFormatHeader: 'JSON-Antwortformat (ohne Markdown-Codeblöcke):',
  outputLanguageInstruction: 'WICHTIG: Sie MÜSSEN Titel und Beschreibung ausschließlich auf Deutsch schreiben. Verwenden Sie keine andere Sprache.',
  ```

  **fr.ts**:
  ```typescript
  jsonFormatHeader: 'Format de réponse JSON (sans blocs de code markdown):',
  outputLanguageInstruction: 'IMPORTANT: Vous DEVEZ écrire le titre et la description uniquement en français. N\'utilisez aucune autre langue.',
  ```

  **es.ts**:
  ```typescript
  jsonFormatHeader: 'Formato de respuesta JSON (sin bloques de código markdown):',
  outputLanguageInstruction: 'IMPORTANTE: DEBE escribir el título y la descripción únicamente en español. No utilice ningún otro idioma.',
  ```

  **Must NOT do**:
  - 기존 번역된 내용 변경
  - 영어 fallback 사용

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (Task 1 완료 후)
  - **Blocked By**: Task 1
  - **Blocks**: Task 3

  **References**:
  - `linear-capture-worker/src/prompts/templates/en.ts` - 영어 템플릿
  - `linear-capture-worker/src/prompts/templates/ko.ts` - 한국어 템플릿
  - `linear-capture-worker/src/prompts/templates/de.ts` - 독일어 템플릿
  - `linear-capture-worker/src/prompts/templates/fr.ts` - 프랑스어 템플릿
  - `linear-capture-worker/src/prompts/templates/es.ts` - 스페인어 템플릿

  **Acceptance Criteria**:
  - [ ] 5개 파일 모두 `jsonFormatHeader` 추가됨
  - [ ] 5개 파일 모두 `outputLanguageInstruction` 추가됨
  - [ ] TypeScript 컴파일 에러 없음

  **Commit**: YES
  - Message: `feat(i18n): add language-specific fields to all 5 templates`
  - Files: `en.ts`, `ko.ts`, `de.ts`, `fr.ts`, `es.ts`

---

- [ ] 3. 프롬프트 빌더 수정

  **What to do**:
  - `issue-prompt.ts`에서 하드코딩된 한국어 제거
  - 템플릿의 `jsonFormatHeader` 사용
  - 프롬프트 최상단에 `outputLanguageInstruction` 추가

  **변경 전** (69-70행, 80-81행):
  ```typescript
  ## JSON 응답 형식 (마크다운 코드블록 없이):
  ```

  **변경 후**:
  ```typescript
  ## ${t.jsonFormatHeader}
  ```

  **프롬프트 구조 변경**:
  ```typescript
  // buildImagePrompt 함수 시작 부분
  return `${t.outputLanguageInstruction}

  ${imageRef} ${t.analyzeInstruction}
  ...
  ## ${t.jsonFormatHeader}
  ${jsonFormat}`;
  ```

  **Must NOT do**:
  - 프롬프트 로직 변경
  - JSON 파싱 로직 변경

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 1, 2
  - **Blocks**: Task 4

  **References**:
  - `linear-capture-worker/src/prompts/issue-prompt.ts:51-82` - buildImagePrompt 함수
  - `linear-capture-worker/src/prompts/issue-prompt.ts:84-113` - buildTextPrompt 함수

  **Acceptance Criteria**:
  - [ ] 하드코딩된 `JSON 응답 형식` 제거됨
  - [ ] `t.jsonFormatHeader` 사용
  - [ ] `t.outputLanguageInstruction` 프롬프트 시작에 추가
  - [ ] TypeScript 컴파일 에러 없음

  **Commit**: YES
  - Message: `fix(i18n): remove hardcoded Korean, use language-specific templates`
  - Files: `issue-prompt.ts`

---

- [ ] 4. Worker 배포 및 검증

  **What to do**:
  - Worker 배포
  - 각 언어별 테스트

  **배포 명령**:
  ```bash
  cd linear-capture-worker
  wrangler deploy
  ```

  **테스트**:
  - Linear Capture 앱에서 각 언어 설정 후 이슈 생성
  - 언어 전환 후 재생성하여 혼합 없음 확인

  **Must NOT do**:
  - 다른 Worker 설정 변경

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocked By**: Task 3

  **References**:
  - `linear-capture-worker/wrangler.toml` - Worker 설정

  **Acceptance Criteria**:
  - [ ] `wrangler deploy` 성공
  - [ ] 영어 설정 → 100% 영어 출력
  - [ ] 한국어 설정 → 100% 한국어 출력
  - [ ] 언어 전환 후 혼합 없음

  **Commit**: NO (배포만)

---

## Commit Strategy

| After Task | Message | Files |
|------------|---------|-------|
| 1 | `feat(i18n): extend PromptTemplates interface` | index.ts |
| 2 | `feat(i18n): add language-specific fields to templates` | en,ko,de,fr,es.ts |
| 3 | `fix(i18n): use language-specific templates in prompt builder` | issue-prompt.ts |

또는 단일 커밋:
```
fix(i18n): complete language separation for stable multilingual output
```

---

## Success Criteria

### Final Checklist
- [ ] 하드코딩된 한국어 없음
- [ ] 5개 언어 모두 명시적 출력 지시 있음
- [ ] 언어 전환 시 혼합 없음
- [ ] Worker 배포 완료

---

## Worktree Info

**작업 브랜치**: `fix/i18n-complete-separation`
**작업 위치**: `/Users/wine_ny/side-project/linear-capture-worktrees/i18n-fix/linear-capture-worker`
