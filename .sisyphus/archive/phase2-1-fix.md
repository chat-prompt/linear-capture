# Semantic Search IPC Fix - 인라인 스크립트 전환

## TL;DR

> **Quick Summary**: 외부 JS 파일에서 ipcRenderer 접근 불가 문제를 해결하기 위해 semantic-search.js를 index.html 인라인 스크립트로 이동
> 
> **Deliverables**:
> - semantic-search.js 코드를 index.html 인라인으로 통합
> - 외부 semantic-search.js 파일 삭제
> - 시맨틱 검색 기능 정상 동작 확인
> 
> **Estimated Effort**: Quick (~30분)
> **Parallel Execution**: NO - sequential
> **Critical Path**: Task 1 → Task 2 → Task 3

---

## Context

### Original Request
시맨틱 검색 UI에서 `semanticSearch.search('테스트')` 호출 시 Promise가 영원히 pending 상태로 유지되고, 터미널에 `[SemanticSearch]` 로그가 출력되지 않는 문제 해결

### Problem Analysis
**핵심 문제**: 외부 JS 파일(semantic-search.js)에서 `window.ipcRenderer` 접근 시 타이밍 문제 발생

```
index.html
├── <script> (인라인, line 1527-3403)
│   └── const { ipcRenderer } = require('electron');  ← 여기서만 동작
│   └── window.ipcRenderer = ipcRenderer;  ← 설정됨
└── <script src="semantic-search.js"> (line 3405)
    └── getIpcRenderer() → window.ipcRenderer  ← 타이밍 문제로 undefined
```

**시도된 해결책과 실패 이유**:
1. `window.ipcRenderer = ipcRenderer;` 추가 → IIFE 즉시 실행으로 실패
2. `getIpcRenderer()` 지연 접근 → 여전히 타이밍 이슈

### Solution Approach
기존 index.html의 모든 기능이 인라인 스크립트로 정상 동작하므로, semantic-search.js 코드를 index.html 인라인으로 이동하여 ipcRenderer를 직접 스코프에서 접근

---

## Work Objectives

### Core Objective
semantic-search.js 코드를 index.html 인라인 스크립트로 이동하여 ipcRenderer 접근 문제 해결

### Concrete Deliverables
- `src/renderer/index.html`: 시맨틱 검색 코드 인라인 포함 (line 1527 근처에 추가)
- `src/renderer/semantic-search.js`: 삭제
- 기능: Title 입력 → blur → 자동 시맨틱 검색 실행

### Definition of Done
- [ ] `npm run build` 성공 (TypeScript 에러 없음)
- [ ] `npm test` 통과 (37 tests, 0 failures)
- [ ] 콘솔에 `[SemanticSearch:JS]` 로그 출력
- [ ] 터미널에 `[SemanticSearch]` 메인 프로세스 로그 출력

### Must Have
- ipcRenderer 직접 접근 (window.ipcRenderer 대신)
- 기존 기능 100% 유지 (검색, 체크박스 선택, Description 삽입)
- 변수명 충돌 방지 (기존 코드와 이름 겹침 체크)

### Must NOT Have (Guardrails)
- ❌ 새로운 외부 JS 파일 생성
- ❌ preload.js나 contextBridge 도입 (스코프 밖)
- ❌ 기존 인라인 스크립트 구조 변경
- ❌ CSS 파일 수정 (semantic-search.css는 그대로 유지)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Bun test)
- **User wants tests**: Manual verification (기존 테스트 유지)
- **Framework**: bun test

### Automated Verification

**빌드 검증:**
```bash
npm run build
# Assert: Exit code 0
# Assert: No "error" in output
```

**테스트 검증:**
```bash
npm test
# Assert: "37 passing" 또는 "0 failures"
```

**앱 실행 검증 (agent via interactive_bash):**
```bash
npm run pack:clean
# Assert: 앱 실행됨
# 검증: DevTools 콘솔에서 semanticSearch.search('테스트') 실행
# Assert: Promise가 resolve됨 (pending 아님)
# Assert: 콘솔에 "[SemanticSearch:JS] performSemanticSearch called" 출력
```

---

## Execution Strategy

### Sequential Execution (No Parallelization)
```
Task 1: 코드 인라인 이동
    ↓
Task 2: 외부 파일 정리
    ↓
Task 3: 빌드 및 검증
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|------------|--------|
| 1 | None | 2, 3 |
| 2 | 1 | 3 |
| 3 | 1, 2 | None |

---

## TODOs

- [ ] 1. semantic-search.js 코드를 index.html 인라인으로 이동

  **What to do**:
  1. `src/renderer/index.html`의 기존 `</script>` 태그 직전 (line 3403 근처)에 시맨틱 검색 코드 추가
  2. IIFE 패턴 제거하고 일반 함수/변수로 변환
  3. `getIpcRenderer()` 호출을 `ipcRenderer` 직접 참조로 변경
  4. 변수명 prefix 추가로 충돌 방지: `semantic_*`

  **Must NOT do**:
  - 새 외부 JS 파일 생성
  - CSS 파일 수정
  - 기존 인라인 스크립트 다른 부분 수정

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단일 파일 수정, 코드 이동 작업
  - **Skills**: [`git-master`]
    - `git-master`: 커밋 메시지 작성 및 git 작업

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 2, 3
  - **Blocked By**: None

  **References**:
  
  **코드 이동 소스** (전체 복사):
  - `src/renderer/semantic-search.js:1-303` - 이동할 전체 코드 (303줄)
  
  **삽입 위치 (패턴 참조)**:
  - `src/renderer/index.html:1527` - `const { ipcRenderer } = require('electron');` (ipcRenderer 선언 위치)
  - `src/renderer/index.html:1528` - `window.ipcRenderer = ipcRenderer;` (window 노출 위치)
  - `src/renderer/index.html:3403` - 기존 인라인 `</script>` 직전 (삽입 위치)
  
  **수정 패턴 (ipcRenderer 접근)**:
  ```javascript
  // Before (semantic-search.js:102, 114)
  const ipc = getIpcRenderer();
  const result = await ipc.invoke('context-semantic-search', {...});
  
  // After (인라인)
  const result = await ipcRenderer.invoke('context-semantic-search', {...});
  ```
  
  **변수명 충돌 체크**:
  - semantic-search.js의 `selectedResults` → `semantic_selectedResults`
  - semantic-search.js의 `currentResults` → `semantic_currentResults`
  - semantic-search.js의 `searchDebounceTimer` → `semantic_searchDebounceTimer`

  **Acceptance Criteria**:
  
  **정적 검증 (Bash):**
  ```bash
  # ipcRenderer 직접 참조 확인
  grep -n "ipcRenderer.invoke('context-semantic-search'" src/renderer/index.html
  # Assert: 결과가 있어야 함 (line number 출력)
  
  # getIpcRenderer 함수 제거 확인
  grep -c "getIpcRenderer" src/renderer/index.html
  # Assert: 0 (없어야 함)
  
  # window.semanticSearch 노출 확인
  grep -n "window.semanticSearch" src/renderer/index.html
  # Assert: 결과가 있어야 함
  ```

  **Commit**: YES
  - Message: `fix(renderer): inline semantic-search.js to fix ipcRenderer access`
  - Files: `src/renderer/index.html`

---

- [ ] 2. 외부 파일 및 참조 정리

  **What to do**:
  1. `src/renderer/semantic-search.js` 파일 삭제
  2. `src/renderer/index.html`에서 `<script src="semantic-search.js"></script>` 제거
  3. (선택) `package.json` copy-assets에서 `*.js` 복사 제거 검토

  **Must NOT do**:
  - semantic-search.css 삭제 (CSS는 유지)
  - 다른 스크립트 참조 수정

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 파일 삭제 및 참조 제거, 단순 작업
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:
  
  **삭제 대상**:
  - `src/renderer/semantic-search.js` - 전체 파일 삭제
  
  **수정 대상**:
  - `src/renderer/index.html:3405` - `<script src="semantic-search.js"></script>` 제거
  
  **확인 필요 (선택)**:
  - `package.json` - copy-assets 스크립트에서 `*.js` 복사 여부 확인

  **Acceptance Criteria**:
  
  **파일 삭제 확인 (Bash):**
  ```bash
  # JS 파일 삭제 확인
  test ! -f src/renderer/semantic-search.js && echo "DELETED" || echo "EXISTS"
  # Assert: "DELETED"
  
  # CSS 파일 유지 확인
  test -f src/renderer/semantic-search.css && echo "EXISTS" || echo "DELETED"
  # Assert: "EXISTS"
  
  # script 태그 제거 확인
  grep -c 'src="semantic-search.js"' src/renderer/index.html
  # Assert: 0
  ```

  **Commit**: YES (Task 1과 함께)
  - Message: `fix(renderer): inline semantic-search.js to fix ipcRenderer access`
  - Files: `src/renderer/index.html`, `src/renderer/semantic-search.js` (deleted)

---

- [ ] 3. 빌드 및 기능 검증

  **What to do**:
  1. `npm run build` 실행하여 TypeScript 컴파일 확인
  2. `npm test` 실행하여 기존 테스트 통과 확인
  3. `npm run pack:clean` 실행하여 앱 테스트
  4. DevTools 콘솔에서 `semanticSearch.search('테스트')` 실행하여 기능 검증

  **Must NOT do**:
  - 테스트 코드 수정
  - 빌드 설정 변경

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 빌드/테스트 실행 및 검증
  - **Skills**: [`playwright`]
    - `playwright`: UI 검증 시 브라우저 자동화 가능

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (최종 검증)
  - **Blocks**: None
  - **Blocked By**: Task 1, 2

  **References**:
  
  **검증 명령어**:
  - `CLAUDE.md:72-77` - 빌드 명령어 참조 (`npm run build`, `npm run pack:clean`)
  
  **IPC 핸들러 (정상 동작 확인용)**:
  - `src/main/index.ts:1090` - `context-semantic-search` 핸들러 위치

  **Acceptance Criteria**:
  
  **빌드 검증 (Bash):**
  ```bash
  npm run build
  # Assert: Exit code 0
  # Assert: No "error TS" in output
  ```
  
  **테스트 검증 (Bash):**
  ```bash
  npm test
  # Assert: "passing" in output
  # Assert: "0 failing" or no "failing" in output
  ```
  
  **앱 패키징 (Bash):**
  ```bash
  npm run pack:clean
  # Assert: 앱 실행됨
  # Assert: release/mac-arm64/Linear Capture.app 존재
  ```
  
  **기능 검증 (DevTools Console에서 수동 실행):**
  ```javascript
  // DevTools 콘솔에서 실행
  semanticSearch.search('테스트')
  // Assert: Promise가 resolve됨 (pending 아님)
  // Assert: 콘솔에 "[SemanticSearch:JS] performSemanticSearch called" 출력
  ```

  **Commit**: NO (검증만 수행)

---

## Commit Strategy

| After Task | Message | Files |
|------------|---------|-------|
| 1 + 2 | `fix(renderer): inline semantic-search.js to fix ipcRenderer access` | `src/renderer/index.html`, `src/renderer/semantic-search.js` (deleted) |

---

## Success Criteria

### Final Verification Commands
```bash
# 1. 빌드 성공
npm run build
# Expected: Exit code 0

# 2. 테스트 통과
npm test
# Expected: All tests passing

# 3. 앱 패키징 및 실행
npm run pack:clean
# Expected: 앱 정상 실행
```

### Final Checklist
- [ ] semantic-search.js 삭제됨
- [ ] index.html에 시맨틱 검색 코드 인라인 포함
- [ ] ipcRenderer 직접 참조 (getIpcRenderer 없음)
- [ ] 기존 테스트 모두 통과
- [ ] DevTools에서 semanticSearch.search() 정상 동작

---

## Post-Implementation Notes

### 향후 고려사항 (Out of Scope)
1. **Preload 스크립트 마이그레이션**: 보안 강화를 위해 장기적으로 contextBridge 방식 전환 검토
2. **모듈 번들러 도입**: Webpack/Vite 등을 사용하면 외부 JS 파일에서도 require 가능
3. **테스트 추가**: semantic-search 관련 단위 테스트 추가
