# i18n 확장: 5개 언어 지원

## TL;DR

> **Quick Summary**: 현재 en/ko 2개 언어에서 de/fr/es 3개 언어를 추가하여 총 5개 언어 지원
> 
> **Deliverables**:
> - 3개 번역 파일 (de, fr, es)
> - 3개 설정 파일 업데이트
> - 1개 검증 스크립트
> - package.json 스크립트 추가
> 
> **Estimated Effort**: Quick (1-2시간)
> **Parallel Execution**: YES - 2 waves
> **Critical Path**: Task 1 → Task 2 → Task 3

---

## Context

### Original Request
기존 en/ko 지원에서 German, French, Spanish를 추가하여 5개 언어 지원

### Interview Summary
**Key Discussions**:
- 번역 방식: AI 자동 번역 (Claude/GPT)
- 검증 방식: JSON 키 일치 검증만 (수동 UI 확인 불필요)

**Research Findings**:
- 현재 212개 번역 키 존재
- SUPPORTED_LANGUAGES가 3곳에 정의됨 (main/i18n.ts, settings-store.ts, settings.html)
- i18next interpolation 구문 `{{variable}}` 보존 필요

### Metis Review
**Identified Gaps** (addressed):
- SUPPORTED_LANGUAGES 3곳 동기화 필요 → 모든 위치 명시적 업데이트
- AI 번역 시 interpolation 구문 손상 위험 → 번역 프롬프트에 명시
- settings.html 드롭다운 업데이트 누락 가능 → 명시적 작업으로 추가
- 빈 문자열 검증 필요 → 검증 스크립트에 포함

---

## Work Objectives

### Core Objective
Linear Capture 앱에 German, French, Spanish 언어 지원 추가

### Concrete Deliverables
1. `locales/de/translation.json` - 212개 키
2. `locales/fr/translation.json` - 212개 키
3. `locales/es/translation.json` - 212개 키
4. `src/main/i18n.ts` 업데이트 - SUPPORTED_LANGUAGES 배열
5. `src/services/settings-store.ts` 업데이트 - SUPPORTED_LANGUAGES 배열
6. `src/renderer/settings.html` 업데이트 - 드롭다운 옵션 3개 추가
7. `scripts/validate-i18n.js` - 키 검증 스크립트
8. `package.json` - validate:i18n 스크립트 추가

### Definition of Done
- [x] `npm run validate:i18n` 실행 시 exit code 0
- [x] 모든 언어 파일이 동일한 키 구조 보유

### Must Have
- 3개 번역 파일 (de/fr/es)
- 3곳의 SUPPORTED_LANGUAGES 동기화
- 검증 스크립트

### Must NOT Have (Guardrails)
- ❌ 기존 en/ko 번역 수정
- ❌ i18next 설정 변경 (fallbackLng, interpolation 등)
- ❌ 새로운 번역 키 추가
- ❌ RTL(우→좌) 지원
- ❌ 복수형 규칙 설정
- ❌ 언어 자동 감지 로직 변경
- ❌ 번역 로딩 테스트 코드
- ❌ 수동 UI 테스트

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: NO (번역 검증용)
- **User wants tests**: Manual-only (JSON 키 일치 검증)
- **Framework**: Node.js 스크립트

### Automated Verification

**검증 스크립트 요구사항:**
```javascript
// scripts/validate-i18n.js
// 1. locales/*/translation.json 모든 파일 로드
// 2. 재귀적으로 모든 키 추출 (중첩 경로)
// 3. en/translation.json을 기준으로 각 언어 비교
// 4. 누락된 키 리포트
// 5. 추가된 키 리포트
// 6. 빈 문자열 값 검출
// 7. 일치하면 exit 0, 불일치하면 exit 1
```

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately):
├── Task 1a: locales/de/translation.json 생성
├── Task 1b: locales/fr/translation.json 생성
└── Task 1c: locales/es/translation.json 생성

Wave 2 (After Wave 1):
├── Task 2: 설정 파일 3곳 업데이트
└── Task 3: 검증 스크립트 생성 및 실행

Critical Path: Task 1 → Task 2 → Task 3
Parallel Speedup: ~30% faster than sequential
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1a | None | 2, 3 | 1b, 1c |
| 1b | None | 2, 3 | 1a, 1c |
| 1c | None | 2, 3 | 1a, 1b |
| 2 | 1a, 1b, 1c | 3 | None |
| 3 | 2 | None | None |

---

## TODOs

- [x] 1. 번역 파일 3개 생성 (de/fr/es)

  **What to do**:
  - `locales/en/translation.json`을 기준으로 AI 번역
  - 각 언어별 디렉토리 생성 후 translation.json 저장
  - 번역 시 다음 사항 준수:
    - `{{variable}}` 구문 그대로 유지
    - 기술 용어 영어 유지: Linear, Slack, Notion, Gmail, OAuth, API, URL, token
    - 네이티브 언어 품질 유지

  **Must NOT do**:
  - en/ko 파일 수정
  - 새 키 추가
  - 키 제거

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]` (특별한 스킬 불필요)

  **Parallelization**:
  - **Can Run In Parallel**: YES (3개 언어 병렬 생성 가능)
  - **Parallel Group**: Wave 1 (1a, 1b, 1c)
  - **Blocks**: Task 2, Task 3
  - **Blocked By**: None

  **References**:
  - `locales/en/translation.json` - 번역 소스 (212개 키)
  - `locales/ko/translation.json` - 번역 구조 참고

  **Acceptance Criteria**:
  ```bash
  # 파일 존재 확인
  ls locales/de/translation.json locales/fr/translation.json locales/es/translation.json
  # 각 파일 키 수 확인
  node -e "console.log(JSON.stringify(require('./locales/de/translation.json'), null, 2).split('\":').length - 1)"
  # → 약 212 이상
  
  # interpolation 구문 보존 확인
  grep -c '{{' locales/de/translation.json
  # → en 파일과 동일한 수
  ```

  **Commit**: YES
  - Message: `feat(i18n): add German, French, Spanish translations`
  - Files: `locales/de/translation.json`, `locales/fr/translation.json`, `locales/es/translation.json`

---

- [x] 2. 설정 파일 3곳 업데이트

  **What to do**:
  - `src/main/i18n.ts:6` - SUPPORTED_LANGUAGES 배열에 'de', 'fr', 'es' 추가
  - `src/services/settings-store.ts` - SUPPORTED_LANGUAGES 배열에 'de', 'fr', 'es' 추가  
  - `src/renderer/settings.html` - 언어 드롭다운에 3개 옵션 추가:
    - `<option value="de">Deutsch</option>`
    - `<option value="fr">Français</option>`
    - `<option value="es">Español</option>`

  **Must NOT do**:
  - i18next 설정 변경 (backend, fallbackLng 등)
  - 기존 en/ko 옵션 수정

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (Task 1 완료 후)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:
  - `src/main/i18n.ts:6` - `const SUPPORTED_LANGUAGES = ['en', 'ko'] as const;`
  - `src/services/settings-store.ts` - SUPPORTED_LANGUAGES 배열 위치 확인 필요
  - `src/renderer/settings.html:712-715` - 기존 언어 드롭다운 구조

  **Acceptance Criteria**:
  ```bash
  # main/i18n.ts 확인
  grep "SUPPORTED_LANGUAGES" src/main/i18n.ts
  # → ['en', 'ko', 'de', 'fr', 'es']
  
  # settings-store.ts 확인
  grep "SUPPORTED_LANGUAGES\|supportedLanguages" src/services/settings-store.ts
  # → de, fr, es 포함
  
  # settings.html 확인
  grep -c "<option value=" src/renderer/settings.html
  # → 언어 옵션이 5개
  ```

  **Commit**: YES
  - Message: `feat(i18n): add de/fr/es to supported languages`
  - Files: `src/main/i18n.ts`, `src/services/settings-store.ts`, `src/renderer/settings.html`

---

- [x] 3. 검증 스크립트 생성 및 실행

  **What to do**:
  - `scripts/validate-i18n.js` 생성
  - `package.json`에 `"validate:i18n": "node scripts/validate-i18n.js"` 추가
  - 검증 실행하여 모든 파일 일치 확인

  **스크립트 기능**:
  1. `locales/*/translation.json` 모든 파일 로드
  2. 재귀적으로 모든 키 추출 (중첩 경로: `app.name`, `common.save` 등)
  3. `en/translation.json`을 기준으로 각 언어 비교
  4. 누락된 키 리포트
  5. 추가된 키 리포트
  6. 빈 문자열 값 검출
  7. 일치하면 exit 0, 불일치하면 exit 1

  **Must NOT do**:
  - 테스트 프레임워크 설치
  - 복잡한 의존성 추가

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO (마지막 작업)
  - **Parallel Group**: Wave 2 (Task 2 이후)
  - **Blocks**: None
  - **Blocked By**: Task 2

  **References**:
  - `locales/en/translation.json` - 기준 파일 구조
  - `package.json` - 스크립트 섹션

  **Acceptance Criteria**:
  ```bash
  # 검증 실행
  npm run validate:i18n
  # → exit code 0, "All languages validated successfully!" 출력
  
  # 스크립트 파일 존재
  ls scripts/validate-i18n.js
  
  # package.json 스크립트 확인
  grep "validate:i18n" package.json
  ```

  **Commit**: YES
  - Message: `chore(i18n): add translation validation script`
  - Files: `scripts/validate-i18n.js`, `package.json`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(i18n): add German, French, Spanish translations` | locales/de/*, locales/fr/*, locales/es/* | grep 키 수 |
| 2 | `feat(i18n): add de/fr/es to supported languages` | i18n.ts, settings-store.ts, settings.html | grep 확인 |
| 3 | `chore(i18n): add translation validation script` | scripts/validate-i18n.js, package.json | npm run validate:i18n |

---

## Success Criteria

### Verification Commands
```bash
# 전체 검증
npm run validate:i18n
# Expected: exit 0

# 파일 수 확인
ls locales/*/translation.json | wc -l
# Expected: 5

# 빌드 확인
npm run build
# Expected: exit 0
```

### Final Checklist
- [x] 5개 언어 파일 존재 (en, ko, de, fr, es)
- [x] 모든 파일 동일한 키 구조
- [x] settings.html에 5개 언어 옵션
- [x] validate:i18n 스크립트 통과
- [x] 기존 en/ko 파일 변경 없음
