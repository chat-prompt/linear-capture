# i18n Dynamic UI Update Fix

## TL;DR

> **Quick Summary**: 언어 변경 시 동적 버튼 텍스트와 드롭다운 기본값(None, Unassigned)이 업데이트되지 않는 문제 수정
> 
> **Deliverables**: 
> - `updateDynamicUI()` 함수 추가
> - `language-changed` 핸들러 보강
> - `createSearchableSelect` 업데이트 메서드 추가
> 
> **Estimated Effort**: Quick
> **Parallel Execution**: NO - sequential
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4

---

## Context

### Original Request
- 언어 변경 시 일부 UI가 제대로 바뀌지 않음
- 특히 버튼과 하단 Linear 드롭다운 영역에 이슈
- 하단 Linear 드롭다운 라벨(Team, Project, Estimate 등)은 영어로 고정 원함

### Interview Summary
**Key Discussions**:
- 버튼: 동적으로 설정되는 버튼 텍스트(reanalyzeBtn)가 언어 변경 시 업데이트 안됨
- 기본값(None, Unassigned): 번역 적용
- Priority 옵션(Urgent, High, Medium, Low): 영어 고정
- 드롭다운 라벨(Team, Project 등): 영어 고정
- 검색 placeholder: 영어 고정
- Empty state 텍스트: 영어 고정

### Metis Review
**Identified Gaps** (addressed):
- `createSearchableSelect`의 `defaultLabel`이 초기화 시 한 번만 설정됨 → 업데이트 메서드 추가
- `updateTeamDependentDropdowns()`에서 Estimate/Cycle 드롭다운 재생성 시 하드코딩된 "None" → 번역 적용 필요
- `ai-analysis-ready` 핸들러에서도 `reanalyzeBtn` 텍스트 설정 → 언어 변경 후에도 올바른 텍스트 표시

---

## Work Objectives

### Core Objective
언어 변경 시 모든 동적 UI 요소(버튼, 드롭다운 기본값)가 정확히 업데이트되도록 수정

### Concrete Deliverables
- `src/renderer/index.html` 내 `updateDynamicUI()` 함수 추가
- `createSearchableSelect` 반환 객체에 `updateDefaultLabel()` 메서드 추가
- `language-changed` 핸들러 보강

### Definition of Done
- [ ] 5개 언어(en, ko, de, fr, es) 전환 시 버튼 텍스트 정확히 변경
- [ ] 드롭다운 기본값이 현재 언어로 정확히 표시됨:
  - en: None, Unassigned
  - ko: 없음, 미배정
  - de: Keine, Nicht zugewiesen
  - fr: Aucun, Non assigné
  - es: Ninguno, Sin asignar
- [ ] 팀 변경 시 Estimate/Cycle 드롭다운의 "None" 옵션도 현재 언어 반영

### Must Have
- `reanalyzeBtn` 텍스트 언어 변경 시 업데이트
- Project 드롭다운 기본값("None" → "없음") 업데이트
- Assignee 드롭다운 기본값("Unassigned" → "미배정") 업데이트
- Estimate/Cycle 드롭다운 "None" 옵션 업데이트

### Must NOT Have (Guardrails)
- 드롭다운 라벨(Team, Project, Status, Priority, Assignee, Estimate, Cycle, Labels) 번역 금지
- Priority 옵션(Urgent, High, Medium, Low) 번역 금지
- 검색 placeholder(Search projects... 등) 번역 금지
- Empty state 텍스트(No results found, + Add labels...) 번역 금지
- i18n 시스템 아키텍처 리팩토링 금지

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: NO (수동 테스트)
- **User wants tests**: Manual-only
- **Framework**: none

### Manual Verification Procedure

**Step 1: 앱 빌드 및 실행**
```bash
npm run pack && open 'release/mac-arm64/Linear Capture.app'
```

**Step 2: DevTools 열기**
- View > Toggle Developer Tools

**Step 3: 5개 언어 변경 테스트**

각 언어로 전환 후 확인할 값:

| 언어 | reanalyzeBtn | None | Unassigned |
|------|-------------|------|------------|
| English | Start Analysis | None | Unassigned |
| 한국어 | 분석 시작 | 없음 | 미배정 |
| Deutsch | Analyse starten | Keine | Nicht zugewiesen |
| Français | Démarrer l'analyse | Aucun | Non assigné |
| Español | Iniciar análisis | Ninguno | Sin asignar |

**DevTools Console 테스트 명령어:**
```javascript
// 버튼 텍스트 확인
document.getElementById('reanalyzeBtn').textContent

// Project 드롭다운 기본값 확인 (None 선택 시)
document.querySelector('#projectTrigger span').textContent

// Assignee 드롭다운 기본값 확인
document.querySelector('#assigneeTrigger span').textContent

// Estimate/Cycle None 옵션 확인
document.querySelector('#estimate option[value=""]').textContent
document.querySelector('#cycle option[value=""]').textContent
```

**테스트 순서:**
1. Settings에서 각 언어로 변경
2. 메인 창으로 돌아가서 위 명령어로 확인
3. 5개 언어 모두 올바른 번역이 표시되면 성공

---

## Execution Strategy

### Sequential Execution (No Parallelization)
- 모든 Task가 동일 파일(`index.html`) 수정
- 순차적으로 진행 필수

---

## TODOs

### Task 1: createSearchableSelect에 updateDefaultLabel 메서드 추가

**What to do**:
- `createSearchableSelect` 함수의 반환 객체에 `updateDefaultLabel(newLabel)` 메서드 추가
- 이 메서드는 `defaultLabel` 변수를 업데이트하고 `render(items)`를 다시 호출

**Must NOT do**:
- 기존 `render`, `selectOption`, `setItems` 메서드 변경 금지
- 드롭다운 동작 변경 금지

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: `[]`

**References**:
- `src/renderer/index.html:1575-1638` - createSearchableSelect 함수 정의

**Acceptance Criteria**:
- [ ] `updateDefaultLabel(newLabel)` 메서드가 반환 객체에 포함됨
- [ ] 메서드 호출 시 기본 옵션 텍스트가 새 라벨로 변경됨

**Code Example**:
```javascript
// 기존 return 문 (line 1638)
return { render, selectOption, setItems: (newItems) => { ... } };

// 수정 후
return { 
  render, 
  selectOption, 
  setItems: (newItems) => { ... },
  updateDefaultLabel: (newLabel) => {
    defaultLabel = newLabel;
    render(items);
  }
};
```

**Commit**: NO (Task 4에서 일괄 커밋)

---

### Task 2: updateDynamicUI 함수 추가

**What to do**:
- `translatePage()` 함수 아래에 `updateDynamicUI()` async 함수 추가
- 다음 요소들의 텍스트 업데이트:
  1. `reanalyzeBtn` 텍스트 (현재 상태에 따라 "분석 시작" 또는 "다시 분석")
  2. `projectSearchable.updateDefaultLabel(await t('common.none'))`
  3. `assigneeSearchable.updateDefaultLabel(await t('form.unassigned'))`
  4. Estimate 드롭다운의 첫 번째 옵션 (`#estimate option[value=""]`)
  5. Cycle 드롭다운의 첫 번째 옵션 (`#cycle option[value=""]`)

**Must NOT do**:
- 드롭다운 라벨 번역 금지
- Priority 옵션 번역 금지

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: `[]`

**References**:
- `src/renderer/index.html:1273-1285` - translatePage 함수
- `src/renderer/index.html:1952-1987` - searchable select 초기화 부분
- `locales/ko/translation.json:16` - common.none
- `locales/ko/translation.json:67` - form.unassigned

**Acceptance Criteria**:
- [ ] `updateDynamicUI()` 함수가 추가됨
- [ ] 함수 호출 시 모든 동적 텍스트가 현재 언어로 업데이트됨

**Code Example**:
```javascript
async function updateDynamicUI() {
  // 1. reanalyzeBtn - 현재 상태에 따라 텍스트 결정
  // aiLoadingDiv가 숨겨져 있고, 분석이 완료된 상태인지 확인
  const hasAnalyzed = titleInput.value.trim() !== '';
  if (!aiLoadingDiv.classList.contains('hidden')) {
    // 로딩 중 - 건드리지 않음
  } else if (hasAnalyzed) {
    reanalyzeBtn.textContent = await t('capture.reanalyze');
  } else {
    reanalyzeBtn.textContent = await t('capture.analysisStart');
  }

  // 2. Searchable selects
  if (projectSearchable) {
    projectSearchable.updateDefaultLabel(await t('common.none'));
  }
  if (assigneeSearchable) {
    assigneeSearchable.updateDefaultLabel(await t('form.unassigned'));
  }

  // 3. Estimate/Cycle None 옵션
  const estimateNone = estimateSelect.querySelector('option[value=""]');
  if (estimateNone) {
    estimateNone.textContent = await t('common.none');
  }
  
  const cycleNone = cycleSelect.querySelector('option[value=""]');
  if (cycleNone) {
    cycleNone.textContent = await t('common.none');
  }
}
```

**Commit**: NO (Task 4에서 일괄 커밋)

---

### Task 3: language-changed 핸들러에 updateDynamicUI 호출 추가

**What to do**:
- `language-changed` 이벤트 핸들러에 `await updateDynamicUI()` 호출 추가
- `translatePage()` 다음에 호출

**Must NOT do**:
- 기존 핸들러 로직 변경 금지
- 다른 이벤트 핸들러 수정 금지

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: `[]`

**References**:
- `src/renderer/index.html:1310-1321` - language-changed 핸들러

**Acceptance Criteria**:
- [ ] `language-changed` 핸들러에서 `updateDynamicUI()` 호출
- [ ] Settings에서 언어 변경 시 즉시 UI 업데이트

**Code Example**:
```javascript
// 기존 핸들러 (line 1310-1321)
ipcRenderer.on('language-changed', async () => {
  try {
    await translatePage();
    await autoTranslate();
    await updateDynamicUI();  // 추가
    if (typeof renderGallery === 'function') await renderGallery();
    // ... 나머지 동일
  } catch (e) {
    console.error('Language change handler error:', e);
  }
});
```

**Commit**: NO (Task 4에서 일괄 커밋)

---

### Task 4: updateTeamDependentDropdowns의 None 옵션 번역 적용

**What to do**:
- `updateTeamDependentDropdowns` 함수를 async로 변경
- Estimate/Cycle 드롭다운 재생성 시 `await t('common.none')` 사용

**Must NOT do**:
- Status 드롭다운 로직 변경 금지
- 드롭다운 라벨 번역 금지

**Recommended Agent Profile**:
- **Category**: `quick`
- **Skills**: `[]`

**References**:
- `src/renderer/index.html` - updateTeamDependentDropdowns 함수 위치 확인 필요

**Acceptance Criteria**:
- [ ] 팀 변경 시 Estimate/Cycle 드롭다운의 "None" 옵션이 현재 언어로 표시됨

**Commit**: YES
- Message: `fix(i18n): update dynamic UI elements on language change`
- Files: `src/renderer/index.html`
- Pre-commit: `npm run build`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 4 | `fix(i18n): update dynamic UI elements on language change` | src/renderer/index.html | npm run build |

---

## Success Criteria

### Verification Commands
```bash
npm run build  # TypeScript 컴파일 성공
npm run pack   # 앱 패키징 성공
```

### Final Checklist
- [ ] 5개 언어(en, ko, de, fr, es) 전환 시 reanalyzeBtn 텍스트 정확히 변경
- [ ] 5개 언어 전환 시 Project 드롭다운 기본값 정확히 변경
- [ ] 5개 언어 전환 시 Assignee 드롭다운 기본값 정확히 변경
- [ ] 5개 언어 전환 시 Estimate/Cycle None 옵션 정확히 변경
- [ ] 드롭다운 라벨(Team, Project 등)은 영어 유지
- [ ] Priority 옵션(Urgent, High 등)은 영어 유지
- [ ] npm run build 성공
