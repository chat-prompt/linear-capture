# i18n 언어 선택 버그 수정

## TL;DR

> **Quick Summary**: 언어 설정이 제대로 반영되지 않는 두 가지 버그 수정 - (1) 언어 변경 후 한국어로 되돌아가는 문제, (2) 제목이 번역되지 않는 문제
> 
> **Deliverables**:
> - App: `index.ts`에서 언어 소스를 settings-store로 변경
> - Worker: 템플릿에 제목 번역 강제 지시 추가
> 
> **Estimated Effort**: Quick (30분 이내)
> **Parallel Execution**: NO - sequential (App 수정 → Worker 수정 → 배포 → 테스트)
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4

---

## Context

### Original Request
- 제목은 번역이 안 되고 한국어로 출력됨
- 언어를 여러 번 바꾸면서 이슈 생성하면 후반부에는 한국어로 나오는 경향 있음

### Interview Summary
**Key Discussions**:
- 기본 fallback 언어: English (사용자 결정)
- 제목 번역: 강제 번역 (스크린샷 언어와 무관하게 선택 언어로)

**Research Findings**:
- `getLanguage()` (settings-store): 이미 완벽히 정규화됨 (`en`, `ko`, `de`, `fr`, `es`만 반환)
- `getCurrentLanguage()` (i18next): 내부 상태로 불안정할 수 있음
- `index.ts:739`에서 `getCurrentLanguage()`를 사용 중 → 문제의 원인

### Root Cause Analysis
| # | 원인 | 위치 | 수정 |
|---|------|------|------|
| 1 | Worker 호출 시 i18next 내부 상태 사용 | `index.ts:739` | `getLanguage()` 사용 |
| 2 | 제목 번역 강제 지시 부재 | `templates/*.ts` | `outputLanguageInstruction` 강화 |

---

## Work Objectives

### Core Objective
언어 설정 화면에서 선택한 언어가 AI 분석 결과에 100% 반영되도록 수정

### Concrete Deliverables
- `src/main/index.ts`: 언어 소스 변경 (1줄)
- `src/prompts/templates/en.ts`: 제목 번역 지시 강화
- `src/prompts/templates/de.ts`: 제목 번역 지시 강화
- `src/prompts/templates/fr.ts`: 제목 번역 지시 강화
- `src/prompts/templates/es.ts`: 제목 번역 지시 강화

### Definition of Done
- [ ] 영어 선택 시 제목/설명 모두 영어로 출력
- [ ] 독일어/프랑스어/스페인어도 동일하게 동작
- [ ] 언어를 여러 번 바꿔도 선택한 언어로 일관되게 출력

### Must Have
- settings-store에서 직접 언어 읽기
- 제목에 대한 명시적 번역 지시

### Must NOT Have (Guardrails)
- 새 언어 추가 (기존 5개 유지)
- 프롬프트 내용 변경 (언어 지시만 강화)
- Worker의 `getTemplates()` 로직 변경 (App에서 해결)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (단위 테스트 없음)
- **User wants tests**: Manual verification
- **QA approach**: 앱에서 직접 테스트

### Manual Verification Procedure
1. `npm run pack:clean`으로 앱 빌드 및 실행
2. Settings에서 English 선택
3. 한국어 텍스트가 포함된 화면 캡처
4. "분석 시작" 클릭
5. 제목/설명이 영어인지 확인
6. 언어를 Korean → German → English 순서로 바꾸며 반복 테스트

---

## Execution Strategy

### Sequential Execution (의존성 있음)

```
Task 1: App 수정 (index.ts)
    ↓
Task 2: Worker 템플릿 수정 (4개 파일)
    ↓
Task 3: Worker 배포 (wrangler deploy)
    ↓
Task 4: 앱 빌드 및 테스트 (npm run pack:clean)
```

---

## TODOs

- [ ] 1. App 언어 소스 변경

  **What to do**:
  - `src/main/index.ts:739`에서 `getCurrentLanguage()` → `getLanguage()` 변경

  **Must NOT do**:
  - i18n.ts 수정
  - settings-store.ts 수정

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 3, Task 4
  - **Blocked By**: None

  **References**:
  - `src/main/index.ts:739` - 수정 대상 라인
  - `src/services/settings-store.ts:149-157` - `getLanguage()` 구현 (이미 정규화됨)
  - `src/main/index.ts:29` - `getLanguage` import 확인

  **Acceptance Criteria**:
  - [ ] `index.ts:739`가 `language: getLanguage()`로 변경됨
  - [ ] TypeScript 컴파일 오류 없음: `npx tsc --noEmit`

  **Commit**: YES
  - Message: `fix(i18n): use settings-store language instead of i18next state`
  - Files: `src/main/index.ts`

---

- [ ] 2. Worker 템플릿 제목 번역 지시 강화

  **What to do**:
  - 4개 언어 템플릿(en, de, fr, es)의 `outputLanguageInstruction`에 제목 번역 명시 추가
  - 형식: "You MUST write the title AND description in [Language]. Even if the screenshot contains [other language] text, translate everything."

  **Must NOT do**:
  - ko.ts 수정 (한국어는 기본값이므로 지시 불필요)
  - titleRules 내용 변경
  - 새 필드 추가

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (Task 1 이후)
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:
  - `src/prompts/templates/en.ts` - 영어 템플릿
  - `src/prompts/templates/de.ts` - 독일어 템플릿
  - `src/prompts/templates/fr.ts` - 프랑스어 템플릿
  - `src/prompts/templates/es.ts` - 스페인어 템플릿

  **Acceptance Criteria**:
  - [ ] 4개 파일의 `outputLanguageInstruction`이 제목 번역을 명시적으로 요구
  - [ ] TypeScript 컴파일 오류 없음: `npx tsc --noEmit`

  **Commit**: YES
  - Message: `fix(i18n): strengthen title translation instructions in templates`
  - Files: `src/prompts/templates/*.ts`

---

- [ ] 3. Worker 배포

  **What to do**:
  - Worktree에서 `wrangler deploy` 실행

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **References**:
  - Worktree 경로: `/Users/wine_ny/side-project/linear-capture-worktrees/i18n-fix/linear-capture-worker`

  **Acceptance Criteria**:
  - [ ] `wrangler deploy` 성공
  - [ ] "Deployed linear-capture-ai" 메시지 확인

  **Commit**: NO (Worker는 별도 저장소)

---

- [ ] 4. 앱 빌드 및 통합 테스트

  **What to do**:
  - `npm run pack:clean`으로 앱 빌드
  - 언어별 테스트 수행

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (최종 단계)
  - **Blocks**: None
  - **Blocked By**: Task 1, Task 3

  **References**:
  - App 경로: `/Users/wine_ny/side-project/linear_project/linear-capture`

  **Acceptance Criteria**:
  - [ ] 앱 빌드 성공
  - [ ] English 선택 → 한국어 스크린샷 캡처 → 영어 제목/설명 출력
  - [ ] 언어 변경 (ko → en → de → en) 후에도 선택 언어로 일관되게 출력

  **Commit**: NO (테스트 단계)

---

## Commit Strategy

| After Task | Message | Files |
|------------|---------|-------|
| 1 | `fix(i18n): use settings-store language instead of i18next state` | `src/main/index.ts` |
| 2 | `fix(i18n): strengthen title translation instructions in templates` | `src/prompts/templates/*.ts` |

---

## Success Criteria

### Final Checklist
- [ ] 영어 선택 시 영어 제목/설명 출력
- [ ] 독일어 선택 시 독일어 제목/설명 출력
- [ ] 언어 여러 번 변경해도 한국어로 되돌아가지 않음
- [ ] 한국어 스크린샷도 선택 언어로 번역됨
