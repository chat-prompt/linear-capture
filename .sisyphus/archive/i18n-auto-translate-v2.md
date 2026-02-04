# i18n 자동 번역 스크립트

## TL;DR

> **Quick Summary**: `npm run translate` 명령어로 영어 기준 누락된 번역 키를 Gemini API로 자동 번역
> 
> **Deliverables**:
> - `scripts/translate-i18n.js` - 자동 번역 스크립트
> - `package.json` - translate 명령어 추가
> 
> **Estimated Effort**: Medium (1-2시간)
> **Parallel Execution**: NO - sequential
> **Critical Path**: Task 1 → Task 2 → Task 3

---

## Context

### Original Request
- 새 UI 추가 시 4개 언어 번역을 수동으로 해야 하는 번거로움
- `npm run translate` 한 번으로 모든 누락 번역 자동 완료 원함

### Interview Summary
**Key Decisions**:
- 실행 시점: 수동 명령어 (`npm run translate`)
- AI 모델: Gemini 3.0 Flash
- 번역 정책: 누락된 키만 추가 (기존 번역 유지)
- 결과 처리: translation.json 파일 직접 수정
- API 키: 환경변수 `GEMINI_API_KEY`
- 에러 처리: 부분 저장 (성공한 번역만 저장, 실패 키 보고)
- Dry-run: 미지원 (간단하게)

### Metis Review
**Identified Gaps** (addressed):
- Interpolation 변수 처리: `{{variable}}` 패턴 보존 필수 → 시스템 프롬프트에 명시
- 에러 복구: 부분 저장으로 결정
- 배치 처리: 10-20개 키씩 배치로 API 호출

---

## Work Objectives

### Core Objective
영어(en) 기준 다른 4개 언어(ko, de, fr, es)에 누락된 번역 키를 Gemini API로 자동 번역

### Concrete Deliverables
- `scripts/translate-i18n.js` - 번역 스크립트
- `package.json` 수정 - `"translate": "node scripts/translate-i18n.js"` 추가

### Definition of Done
- [ ] `npm run translate` 실행 시 누락 키 자동 번역
- [ ] `{{variable}}` 패턴이 번역 후에도 보존됨
- [ ] 기존 번역은 변경되지 않음
- [ ] `npm run validate:i18n` 통과

### Must Have
- 영어 기준 누락 키 감지
- Gemini API 호출로 번역
- `{{variable}}` 패턴 보존
- 파일 직접 수정
- 에러 시 부분 저장

### Must NOT Have (Guardrails)
- CI/자동화 연동 (Step 2)
- 번역 메모리/캐시 (과도한 최적화)
- 새 언어 추가 지원 (별도 작업)
- 기존 번역 덮어쓰기
- `en/translation.json` 수정
- Dry-run 모드
- 품질 점수/신뢰도 계산

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (validate-i18n.js 검증 스크립트)
- **User wants tests**: Manual verification
- **QA approach**: 직접 실행 테스트

### Manual Verification Procedure
```bash
# 1. 테스트 키 추가
# locales/en/translation.json에 "test.autoTranslate": "Hello World" 추가

# 2. 번역 실행
npm run translate

# 3. 결과 확인
grep "autoTranslate" locales/ko/translation.json
# Expected: "autoTranslate": "안녕하세요 세계" (또는 유사 번역)

# 4. Interpolation 보존 확인
grep "{{" locales/ko/translation.json | wc -l
# Expected: 영어와 동일한 개수

# 5. 검증 스크립트 통과
node scripts/validate-i18n.js
# Expected: "All languages validated successfully!"

# 6. 테스트 키 삭제 (정리)
```

---

## Execution Strategy

### Sequential Execution

```
Task 1: translate-i18n.js 스크립트 생성
    ↓
Task 2: package.json에 명령어 추가
    ↓
Task 3: 테스트 및 검증
```

---

## TODOs

- [ ] 1. translate-i18n.js 스크립트 생성

  **What to do**:
  - `scripts/translate-i18n.js` 파일 생성
  - `validate-i18n.js`에서 유틸리티 함수 재사용 (extractKeys, getNestedValue, loadTranslations)
  - Gemini API 호출 로직 구현
  - 배치 처리 (10-20개 키씩)
  - Interpolation 보존 검증

  **Script Flow**:
  ```
  1. GEMINI_API_KEY 환경변수 확인
  2. 모든 translation.json 로드
  3. 영어 기준 각 언어별 누락 키 찾기
  4. 누락 키가 없으면 "All translations up to date" 출력 후 종료
  5. 언어별로:
     a. 누락 키들을 배치로 나눔 (10개씩)
     b. Gemini API 호출 (시스템 프롬프트에 {{variable}} 보존 지시)
     c. 응답 파싱 및 interpolation 검증
     d. 기존 번역에 머지
     e. 파일에 atomic write
  6. 결과 요약 출력: "Translated X keys (ko: N, de: N, fr: N, es: N)"
  ```

  **System Prompt for Gemini**:
  ```
  You are a professional translator. Translate the following JSON key-value pairs from English to {targetLanguage}.

  CRITICAL RULES:
  1. Preserve ALL {{variable}} placeholders EXACTLY as-is (do not translate variable names)
  2. Maintain the same JSON structure
  3. Only translate the string values, not the keys
  4. Keep the tone consistent with existing translations

  Return ONLY valid JSON, no explanations.
  ```

  **Must NOT do**:
  - `en/translation.json` 수정
  - 기존 번역 덮어쓰기
  - 캐싱 로직 추가

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 2, Task 3
  - **Blocked By**: None

  **References**:
  - `scripts/validate-i18n.js:25-70` - extractKeys, getNestedValue, loadTranslations 유틸리티
  - `locales/en/translation.json` - 참조 파일 구조
  - Gemini API: `@google/generative-ai` npm 패키지

  **Acceptance Criteria**:
  - [ ] `scripts/translate-i18n.js` 파일 생성됨
  - [ ] GEMINI_API_KEY 없을 때 적절한 에러 메시지 출력
  - [ ] `node scripts/translate-i18n.js` 실행 시 에러 없음

  **Commit**: NO (Task 2와 함께)

---

- [ ] 2. package.json에 명령어 추가

  **What to do**:
  - `package.json`의 scripts 섹션에 `"translate": "node scripts/translate-i18n.js"` 추가

  **Must NOT do**:
  - 다른 scripts 수정
  - dependencies 추가 (Gemini SDK는 동적 import 또는 fetch 사용)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:
  - `package.json:scripts` 섹션

  **Acceptance Criteria**:
  - [ ] `npm run translate` 명령어 실행 가능
  - [ ] `npm run translate --help` 또는 직접 실행 시 올바르게 동작

  **Commit**: YES
  - Message: `feat(i18n): add auto-translate script using Gemini API`
  - Files: `scripts/translate-i18n.js`, `package.json`

---

- [ ] 3. 테스트 및 검증

  **What to do**:
  - 테스트 키를 추가하여 번역 동작 확인
  - Interpolation 보존 확인
  - validate-i18n.js 통과 확인

  **Verification Commands**:
  ```bash
  # 1. 테스트 키 추가 (수동)
  # locales/en/translation.json에 "test.autoTranslate": "Hello {{name}}" 추가

  # 2. 번역 실행
  GEMINI_API_KEY=your_key npm run translate

  # 3. 결과 확인
  grep "autoTranslate" locales/ko/translation.json
  grep "autoTranslate" locales/de/translation.json
  grep "autoTranslate" locales/fr/translation.json
  grep "autoTranslate" locales/es/translation.json

  # 4. Interpolation 보존 확인
  grep "{{name}}" locales/ko/translation.json

  # 5. 검증 스크립트
  node scripts/validate-i18n.js

  # 6. 테스트 키 삭제 (정리)
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (최종 단계)
  - **Blocks**: None
  - **Blocked By**: Task 1, Task 2

  **Acceptance Criteria**:
  - [ ] 4개 언어에 번역 추가됨
  - [ ] `{{name}}` 패턴 보존됨
  - [ ] `node scripts/validate-i18n.js` 성공

  **Commit**: NO (테스트 후 테스트 키 삭제)

---

## Commit Strategy

| After Task | Message | Files |
|------------|---------|-------|
| 2 | `feat(i18n): add auto-translate script using Gemini API` | `scripts/translate-i18n.js`, `package.json` |

---

## Success Criteria

### Verification Commands
```bash
# 누락 키 없을 때
npm run translate
# Expected: "No missing keys found. All translations up to date."

# 누락 키 있을 때
npm run translate
# Expected: "Translated X keys (ko: N, de: N, fr: N, es: N)"

# 검증
node scripts/validate-i18n.js
# Expected: "All languages validated successfully!"
```

### Final Checklist
- [ ] `npm run translate` 명령어 동작
- [ ] 누락 키 자동 번역
- [ ] `{{variable}}` 패턴 보존
- [ ] 기존 번역 유지
- [ ] 에러 시 부분 저장 및 보고
