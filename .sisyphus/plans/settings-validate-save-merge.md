# Settings: Validate & Save 버튼 통합

## TL;DR

> **Quick Summary**: 설정 화면의 Linear API 토큰 "검증(Validate)" + "저장(Save)" 2-step 플로우를 하나의 "검증 및 저장" 버튼으로 통합. 저장 성공 후 `loadSyncStatus()`를 호출하여 Linear 동기화 버튼이 자연스럽게 활성화되도록 개선.
> 
> **Deliverables**:
> - `settings.html` 내 버튼 통합 및 핸들러 병합
> - 새 i18n 키 추가 + 5개 언어 번역
> 
> **Estimated Effort**: Quick
> **Parallel Execution**: NO - sequential (2 tasks)
> **Critical Path**: Task 1 → Task 2

---

## Context

### Original Request
"검증 & 저장 합치면 어때?" + "검증&저장되면 바로 새로고침이 되어서 리니어 동기화 버튼도 활성화가 자연스럽게 되는 것처럼 보이면 좋겠음"

### Interview Summary
- 현재 UX: 토큰 입력 → "Validate" 클릭 → 성공 → "Save" 활성화 → "Save" 클릭 (2-step)
- 원하는 UX: 토큰 입력 → "검증 및 저장" 클릭 → 한 번에 완료 (1-step)
- 저장 후 Linear Sync 버튼이 자연스럽게 활성화되어야 함

### Metis Review
**Identified Gaps** (addressed):
- `common.validate` 키는 `onboarding.html`에서도 사용됨 → 기존 키 유지, 새 키 추가
- `common.save` 키는 Slack 채널 모달에서도 사용됨 → 기존 키 유지
- `settings-updated` 이벤트는 `mainWindow`에만 전송됨 → `loadSyncStatus()` 직접 호출 필요
- 더블클릭 방지 필요 → 버튼 즉시 disable
- validate ✅ → save ❌ 시나리오 핸들링 필요

---

## Work Objectives

### Core Objective
설정 화면의 토큰 검증/저장 UX를 2-step에서 1-step으로 간소화하고, 저장 후 Integrations 섹션의 Linear Sync 버튼을 자동 활성화.

### Concrete Deliverables
- `src/renderer/settings.html`: 버튼 통합 + 핸들러 병합
- `locales/en/translation.json`: 새 i18n 키 추가
- `locales/{ko,de,fr,es}/translation.json`: 번역 자동 생성

### Definition of Done
- [ ] 설정 화면에 "Validate" + "Save" 대신 하나의 "검증 및 저장" 버튼만 존재
- [ ] 버튼 클릭 시 validate → save 순차 실행
- [ ] 저장 성공 후 Linear Sync 버튼 자동 활성화
- [ ] `npm run validate:i18n` 에러 없음

### Must Have
- 버튼 1개로 통합 (validate + save)
- 단계별 피드백: "Validating..." → "Saving..." → "Saved!"
- 저장 후 `loadSyncStatus()` 직접 호출
- 이미 저장된 토큰 로드 시 버튼 비활성화 (재수정 시 활성화)
- 5개 언어 번역

### Must NOT Have (Guardrails)
- ❌ `onboarding.html` 수정 — 별도 UX 플로우, 범위 밖
- ❌ `ipc-handlers.ts` 수정 — 백엔드 로직 변경 불필요
- ❌ `common.validate` 또는 `common.save` i18n 키 삭제/변경 — 다른 곳에서 사용 중
- ❌ CSS 스타일링 변경 — 기존 `.btn-primary` 스타일 그대로 사용
- ❌ `clearBtn` 동작 변경
- ❌ Integration/Sync 섹션 로직 변경
- ❌ 상태 함수(`showPending`, `showSuccess`, `showError`) 대규모 리팩토링 — `saveBtn` 참조만 제거

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: None
- **Framework**: none

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

모든 검증은 `npm run pack:clean` 후 앱을 실행하여 확인.

---

## Execution Strategy

### Sequential Execution
```
Task 1: settings.html 버튼 통합 + 핸들러 병합
  ↓
Task 2: i18n 키 추가 + 번역 생성 + 검증
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|------------|--------|
| 1 | None | 2 |
| 2 | 1 | None |

---

## TODOs

- [ ] 1. settings.html 버튼 통합 및 핸들러 병합

  **What to do**:

  **1-A. HTML 변경 (line 935-939)**:
  - `saveBtn` 요소 제거
  - `validateBtn`의 `data-i18n` 속성을 `common.validateAndSave`로 변경
  - 기본 텍스트를 `Validate & Save`로 변경

  **1-B. JS 변수/참조 정리**:
  - `saveBtn` 변수 선언 제거 (line 1171)
  - `isValidated` 변수는 유지 (내부 상태 관리에 여전히 필요)
  - `validatedUser` 변수는 유지

  **1-C. 상태 함수에서 saveBtn 참조 제거**:
  - `showPending()` (line 1195-1206): `saveBtn` 관련 3줄 제거 (`validateBtn.className`, `saveBtn.className`, `saveBtn.disabled` 라인)
  - `showValidating()` (line 1208-1216): `saveBtn.disabled = true` 제거
  - `showSuccess()` (line 1218-1231): `validateBtn.className` 변경 라인, `saveBtn.className`, `saveBtn.disabled` 라인 제거. 대신 `validateBtn.disabled = true` 추가 (이미 저장된 상태이므로 비활성화)
  - `showError()` (line 1233-1246): `saveBtn.className`, `saveBtn.disabled` 라인 제거

  **1-D. validateBtn 클릭 핸들러 병합 (line 1258-1278)**:
  기존 validate 핸들러에 save 로직을 추가:
  ```javascript
  validateBtn.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    if (!token) {
      showError(await t('errors.tokenRequired'));
      return;
    }

    // Phase 1: Validate
    await showValidating();

    try {
      const result = await ipcRenderer.invoke('validate-token', token);

      if (result.valid && result.user) {
        // Phase 2: Save (auto-save after validation)
        validateBtn.innerHTML = '<span class="loading"></span>' + await t('settings.saving');
        
        try {
          const saveResult = await ipcRenderer.invoke('save-settings', {
            linearApiToken: token,
            userInfo: result.user
          });

          if (saveResult.success) {
            await showSuccess(result.user);
            validateBtn.textContent = await t('settings.saved');
            
            // Refresh sync status to activate Linear sync button
            await loadSyncStatus();
            
            setTimeout(async () => {
              validateBtn.textContent = await t('common.validateAndSave');
              validateBtn.disabled = true; // Already saved — disable until token changes
            }, 1500);
          } else {
            await showError(saveResult.error || await t('settings.saveFailed'));
            validateBtn.textContent = await t('common.validateAndSave');
            validateBtn.disabled = false;
          }
        } catch (saveError) {
          await showError(await t('errors.saveError'));
          validateBtn.textContent = await t('common.validateAndSave');
          validateBtn.disabled = false;
        }
      } else {
        await showError(result.error || await t('settings.invalidToken'));
        validateBtn.textContent = await t('common.validateAndSave');
      }
    } catch (error) {
      await showError(await t('errors.validationError'));
      validateBtn.textContent = await t('common.validateAndSave');
    }
  });
  ```

  **1-E. saveBtn 클릭 핸들러 전체 제거 (line 1280-1312)**

  **1-F. Enter 키 핸들러 단순화 (line 1336-1344)**:
  ```javascript
  tokenInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      validateBtn.click();
    }
  });
  ```

  **1-G. tokenInput 변경 핸들러 수정 (line 1249-1256)**:
  - `showPending()` 호출은 유지 (상태 리셋)
  - `validateBtn.disabled = false` 추가 (토큰이 변경되면 버튼 다시 활성화)
  - `validateBtn.textContent` 리셋 추가

  **1-H. loadSettings 함수 수정 (line 1176-1193)**:
  - 이미 저장된 토큰 로드 시 `saveBtn.disabled = true` → `validateBtn.disabled = true`로 변경
  - 이미 연결된 상태에서 버튼 비활성화

  **Must NOT do**:
  - `onboarding.html` 수정
  - IPC 핸들러 수정
  - `common.validate`, `common.save` i18n 키 삭제
  - CSS 변경
  - `clearBtn` 동작 변경

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: 설정 UI의 버튼 통합 및 상태 관리 로직 수정에 적합

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:

  **Pattern References** (existing code to follow):
  - `src/renderer/settings.html:1258-1278` - 현재 validateBtn 클릭 핸들러 (validate 로직의 기반)
  - `src/renderer/settings.html:1280-1312` - 현재 saveBtn 클릭 핸들러 (save 로직을 여기서 가져와 병합)
  - `src/renderer/settings.html:1195-1246` - showPending/showValidating/showSuccess/showError 상태 함수들 (saveBtn 참조 제거 대상)
  - `src/renderer/settings.html:1176-1193` - loadSettings 함수 (이미 저장된 토큰 로드 시 동작)
  - `src/renderer/settings.html:1249-1256` - tokenInput 변경 핸들러 (토큰 수정 시 상태 리셋)
  - `src/renderer/settings.html:1336-1344` - Enter 키 핸들러 (단순화 대상)
  - `src/renderer/settings.html:2100-2149` - loadSyncStatus 함수 (저장 후 호출하여 Linear Sync 활성화)
  - `src/renderer/settings.html:2238` - settings-updated 리스너 (참고: mainWindow에만 전송됨, 직접 loadSyncStatus 호출 필요)

  **API/Type References**:
  - `src/main/ipc-handlers.ts:290-297` - validate-token IPC 핸들러 (반환값: `{ valid, user }`)
  - `src/main/ipc-handlers.ts:300-317` - save-settings IPC 핸들러 (반환값: `{ success }`)

  **WHY Each Reference Matters**:
  - `validateBtn` 핸들러가 기반 코드 — 여기에 save 로직을 추가
  - `saveBtn` 핸들러에서 save 로직을 가져옴 — 병합 후 제거
  - 상태 함수들에서 `saveBtn` 참조를 제거하되, 전체 리팩토링은 하지 않음
  - `loadSyncStatus()`가 핵심 — 저장 후 직접 호출해야 Linear Sync 버튼 활성화
  - `settings-updated`는 `mainWindow`에만 가므로 의존하면 안 됨

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 버튼 통합 확인 — Save 버튼 제거, 하나의 버튼만 존재
    Tool: Bash (grep)
    Preconditions: Task 1 코드 수정 완료
    Steps:
      1. grep -c "saveBtn" src/renderer/settings.html
      2. Assert: count is 0 (모든 saveBtn 참조 제거됨)
      3. grep "validateBtn" src/renderer/settings.html | head -5
      4. Assert: validateBtn이 존재하고 data-i18n="common.validateAndSave"
    Expected Result: saveBtn 참조 0개, validateBtn에 새 i18n 키 적용
    Evidence: grep 출력

  Scenario: TypeScript 빌드 성공
    Tool: Bash
    Preconditions: 코드 수정 완료
    Steps:
      1. npm run build
      2. Assert: exit code 0, no errors
    Expected Result: 빌드 성공
    Evidence: 빌드 출력 로그
  ```

  **Commit**: YES
  - Message: `feat(settings): merge validate and save buttons into single action`
  - Files: `src/renderer/settings.html`
  - Pre-commit: `npm run build`

---

- [ ] 2. i18n 키 추가 및 번역 생성

  **What to do**:

  **2-A. 영어 번역 파일에 새 키 추가**:
  `locales/en/translation.json`에 `common.validateAndSave` 키 추가:
  ```json
  "validateAndSave": "Validate & Save"
  ```
  `common` 객체 안에 기존 `validate` 키 근처에 추가.

  **2-B. 자동 번역 실행**:
  ```bash
  npm run translate
  ```
  → ko, de, fr, es 4개 언어에 자동 번역 생성

  **2-C. 검증**:
  ```bash
  npm run validate:i18n
  ```
  → 누락/중복 키 없음 확인

  **Must NOT do**:
  - `common.validate` 키 삭제 또는 변경
  - `common.save` 키 삭제 또는 변경
  - 기존 번역 수동 수정

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: i18n 파일 구조 이해 및 번역 명령어 실행

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: None
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `locales/en/translation.json` - 기존 `common.validate` 키 위치 확인, 같은 레벨에 새 키 추가
  - `CLAUDE.md` "i18n 자동 번역" 섹션 - 번역 워크플로우 규칙 (en이 기준, npm run translate 실행)

  **WHY Each Reference Matters**:
  - en 파일의 `common` 객체 구조를 따라 새 키를 올바른 위치에 추가
  - CLAUDE.md의 i18n 규칙을 따라 자동 번역 + 검증 실행

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: i18n 키 존재 확인
    Tool: Bash (grep)
    Preconditions: i18n 키 추가 완료
    Steps:
      1. grep "validateAndSave" locales/en/translation.json
      2. Assert: "Validate & Save" 값이 존재
      3. grep "validateAndSave" locales/ko/translation.json
      4. Assert: 한국어 번역이 존재
    Expected Result: 5개 언어 모두에 키 존재
    Evidence: grep 출력

  Scenario: i18n 검증 통과
    Tool: Bash
    Preconditions: npm run translate 완료
    Steps:
      1. npm run validate:i18n
      2. Assert: exit code 0, 누락 키 없음
    Expected Result: 검증 통과
    Evidence: validate 출력

  Scenario: 기존 키 보존 확인
    Tool: Bash (grep)
    Preconditions: i18n 수정 완료
    Steps:
      1. grep '"validate"' locales/en/translation.json
      2. Assert: common.validate 키가 여전히 존재
      3. grep '"save"' locales/en/translation.json
      4. Assert: common.save 키가 여전히 존재
    Expected Result: 기존 키 손상 없음
    Evidence: grep 출력
  ```

  **Commit**: YES (Task 1과 함께 하나의 커밋으로)
  - Message: `feat(settings): merge validate and save buttons into single action`
  - Files: `src/renderer/settings.html`, `locales/*/translation.json`
  - Pre-commit: `npm run build && npm run validate:i18n`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1+2 | `feat(settings): merge validate and save buttons into single action` | `src/renderer/settings.html`, `locales/*/translation.json` | `npm run build && npm run validate:i18n` |

---

## Success Criteria

### Verification Commands
```bash
npm run build          # Expected: 빌드 성공
npm run validate:i18n  # Expected: 누락/중복 키 없음
npm run pack:clean     # Expected: 앱 실행, 설정 화면에서 버튼 통합 확인
```

### Final Checklist
- [ ] "Validate" + "Save" 대신 하나의 "Validate & Save" 버튼
- [ ] 버튼 클릭 → "Validating..." → "Saving..." → "Saved!" → 비활성화
- [ ] 저장 후 Linear Sync 버튼 자동 활성화
- [ ] 이미 저장된 토큰 로드 시 버튼 비활성화
- [ ] 토큰 수정 시 버튼 다시 활성화
- [ ] Enter 키로 통합 버튼 트리거
- [ ] `common.validate`, `common.save` 기존 키 보존
- [ ] `onboarding.html` 영향 없음
- [ ] 5개 언어 번역 완료
- [ ] `npm run validate:i18n` 통과
