# Fix Null Reference Error in Related Context UI

## TL;DR

> **Quick Summary**: HTML에서 제거된 기존 섹션들의 JS 코드가 null 참조 에러 발생. 조건문으로 감싸서 해결.
> 
> **Deliverables**:
> - `src/renderer/index.html` JS 코드에 null 체크 추가
> 
> **Estimated Effort**: Quick (5분)
> **Working Directory**: `/Users/wine_ny/side-project/linear_project/linear-capture-worktrees/related-context-ui`

---

## Context

### 문제
```
index.html:2792 Uncaught TypeError: Cannot read properties of null (reading 'addEventListener')
```

### 원인
- HTML에서 `#contextSection`, `#aiRecommendSection` 제거됨
- 하지만 관련 JS 코드는 그대로 남아있음
- `document.getElementById()`가 null 반환 → addEventListener 호출 시 에러

---

## TODOs

- [ ] 1. Context Search Section JS에 null 체크 추가

  **File**: `src/renderer/index.html` (worktree: related-context-ui)
  
  **Line 2744** - 변경:
  ```javascript
  // ==================== Context Search Section ====================
  const contextSection = document.getElementById('contextSection');
  const contextHeader = document.getElementById('contextHeader');
  ```
  →
  ```javascript
  // ==================== Context Search Section (LEGACY - removed) ====================
  const contextSection_legacy = document.getElementById('contextSection');
  if (contextSection_legacy) {
  const contextHeader = document.getElementById('contextHeader');
  ```
  
  **Line 3476 앞** - 닫는 괄호 추가:
  ```javascript
  } // End of legacy Context Search Section
  ```

---

- [ ] 2. AI Recommendation Section JS에 null 체크 추가

  **Line 3477** - 변경:
  ```javascript
  // ==================== AI Recommendation Section ====================
  const aiRecommendSection = document.getElementById('aiRecommendSection');
  ```
  →
  ```javascript
  // ==================== AI Recommendation Section (LEGACY - removed) ====================
  const aiRecommendSection = document.getElementById('aiRecommendSection');
  if (aiRecommendSection) {
  ```
  
  **Line 3887 앞** - 닫는 괄호 추가:
  ```javascript
  } // End of legacy AI Recommendation Section
  ```

---

- [ ] 3. 빌드 및 테스트

  ```bash
  cd /Users/wine_ny/side-project/linear_project/linear-capture-worktrees/related-context-ui
  npm run build && npm run pack:clean
  ```

  **Acceptance**:
  - 콘솔 에러 없음
  - Related Context 섹션 클릭 → 펼쳐짐
  - Title 입력 → 검색 실행

---

## Success Criteria

- [ ] null 참조 에러 해결
- [ ] Related Context UI 정상 동작
