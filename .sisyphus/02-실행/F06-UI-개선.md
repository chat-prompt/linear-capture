# UI Improvement - 연동/동기화 통합 및 컨텍스트 UX 개선

## TL;DR

> **Quick Summary**: Settings UI의 연동(Integrations)과 동기화(Data Sync) 섹션을 하나의 "연동" 섹션으로 통합하고, 메인 UI의 "관련 컨텍스트" 섹션 표현을 개선하여 사용자가 기능의 가치를 직관적으로 이해할 수 있게 함.
> 
> **Deliverables**:
> - settings.html: 통합된 "연동" 섹션 (OpenAI Key 포함)
> - index.html: 개선된 컨텍스트 섹션 제목 및 미연동 안내 (설정 열기 버튼 포함)
> - i18n: 5개 언어 번역 키 추가 (en, ko + 자동번역 de, fr, es)
> 
> **Estimated Effort**: Medium
> **Parallel Execution**: NO - sequential (의존성 있음)
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5

---

## 핵심 UI 결정사항

| 항목 | 결정 |
|------|------|
| **섹션 제목** | "연동" (기존 `settings.integrations` 키 활용) |
| **연동 후 UI** | 동기화 버튼 + ⋮ 메뉴 |
| **⋮ 메뉴 인터랙션** | 클릭 토글 (클릭→열림, 외부 클릭→닫힘) |
| **행 레이아웃** | `[아이콘] [서비스명] [워크스페이스] [문서수] --- [시간] [동기화] [⋮]` |
| **OpenAI Key 위치** | 연동 섹션 내부 (상단) |
| **Linear 행** | 별도 유지 (⋮ 메뉴 없이 동기화 버튼만) |
| **미연동 안내** | 안내 메시지 + 설정 열기 버튼 |

---

## Context

### Original Request
UI를 전반적으로 개선:
1. 환경 설정에서 슬랙, 지메일 등 연동 부분에 왜 연동해야하는지 한 줄 소개 필요
2. 연동과 동기화가 분리되어 불편 → 통합 요청
3. 메인 UI에서 "관련 컨텍스트"를 더 가치 있게 표현

### Interview Summary
**Key Discussions**:
- **통합 UI 방식**: 인라인 확장 방식 선택 (미연동→연동 버튼, 연동됨→동기화+⋮메뉴)
- **섹션 제목**: "연동" (기존 `settings.integrations` 키 그대로 사용)
- **⋮ 메뉴 옵션**: 워크스페이스 변경, 연결 해제
- **⋮ 메뉴 인터랙션**: 클릭 토글 방식
- **행 레이아웃**: `[아이콘] [서비스명] [워크스페이스] [문서수] --- [시간] [동기화] [⋮]`
- **OpenAI Key 위치**: 연동 섹션 내부 (상단, 설명 문구 아래)
- **Linear 행**: 별도 유지 (⋮ 메뉴 없이 동기화 버튼만)
- **컨텍스트 섹션 제목**: "📎 Slack/Notion/Gmail에서 관련 내용 찾기"
- **미연동 안내**: 안내 메시지 + 설정 열기 버튼
- **테스트**: npm run pack:clean 수동 테스트만

**Research Findings**:
- settings.html: Integrations (602-641), Data Sync (643-703)
- settings.html: loadSyncStatus 함수 (1528-1597) - 연동 상태 조회 IPC 패턴
- index.html: Related Context (1413-1468)
- 각 서비스별 IPC 핸들러: `slack-status`, `notion-status`, `gmail-status`

### Metis Review
**Identified Gaps** (addressed):
- **Linear sync row**: Data Sync에만 존재 (OAuth 불필요). → 별도 유지 결정
- **⋮ 드롭다운 패턴**: 새로 구현 필요 → CSS-only 드롭다운
- **동기화 카운트**: 통합 행에 표시 → 워크스페이스명 옆에 표시
- **빈 상태 조건**: 모든 서비스 미연동 시 → 안내 표시
- **긴 이름 처리**: ellipsis + tooltip 적용

---

## Work Objectives

### Core Objective
Settings UI의 사용성을 개선하고, 메인 UI에서 관련 컨텍스트 기능의 가치를 명확히 전달

### Concrete Deliverables
- `src/renderer/settings.html`: 통합 UI + 드롭다운 메뉴 구현
- `src/renderer/index.html`: 섹션 제목 및 미연동 안내 변경
- `locales/en/translation.json`: 새 i18n 키 추가
- `locales/ko/translation.json`: 한국어 번역 추가

### Definition of Done
- [ ] settings.html에서 Integrations + Data Sync가 하나의 "연동" 섹션으로 통합됨
- [ ] sync-section 클래스가 완전히 제거됨
- [ ] 각 서비스 행이 연동 상태에 따라 동적으로 표시됨 (미연동: 연동 버튼 / 연동됨: 동기화+⋮메뉴)
- [ ] ⋮ 메뉴가 클릭 토글 방식으로 정상 작동 (워크스페이스 변경, 연결 해제)
- [ ] Linear 행은 ⋮ 메뉴 없이 동기화 버튼만 표시됨
- [ ] OpenAI Key 입력이 연동 섹션 내부에 배치됨
- [ ] index.html의 컨텍스트 섹션 제목이 "📎 Slack/Notion/Gmail에서 관련 내용 찾기"로 변경됨
- [ ] 미연동 시 안내 메시지 + 설정 열기 버튼이 표시됨
- [ ] 모든 i18n 키가 추가되고 번역됨 (en, ko, de, fr, es)
- [ ] npm run pack:clean으로 빌드 및 실행 가능

### Must Have
- 인라인 확장 방식 UI (연동 전/후 상태 전환)
- ⋮ 드롭다운 메뉴 (CSS-only, 클릭으로 열림/닫힘)
- 섹션 설명 문구 추가
- 메인 UI 제목 변경 + 미연동 안내

### Must NOT Have (Guardrails)
- IPC 핸들러 수정 (`slack-connect`, `slack-disconnect`, `*-sync` 등)
- 동기화 로직 변경 (5분 자동 동기화 유지)
- OAuth 플로우 변경
- 새로운 서비스 추가
- 애니메이션 또는 외부 라이브러리 추가
- 기존 element ID 변경 (JS 호환성 유지)
- 기존 i18n 키 이름 변경 (새 키만 추가)

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.
> 본 프로젝트는 Electron 앱으로, npm run pack:clean 후 수동 테스트가 표준입니다 (CLAUDE.md).

### Test Decision
- **Infrastructure exists**: NO (Electron UI 테스트)
- **Automated tests**: None
- **Framework**: N/A

### Agent-Executed QA Scenarios (MANDATORY — ALL tasks)

**Verification Tool by Deliverable Type:**

| Type | Tool | How Agent Verifies |
|------|------|-------------------|
| **Settings UI** | Bash (npm run pack:clean) | 빌드 성공 확인, 앱 실행 확인 |
| **HTML 변경** | Read + Grep | 파일 내용 검증, 새 요소 존재 확인 |
| **i18n 키** | Read + Bash (npm run validate:i18n) | 누락 키 없음 확인 |

---

## Execution Strategy

### Sequential Execution

이 작업은 의존성이 있어 순차 실행:

```
Task 1: settings.html - 통합 UI 구조 생성
    ↓
Task 2: settings.html - JS 로직 통합
    ↓
Task 3: index.html - 컨텍스트 섹션 개선
    ↓
Task 4: i18n - 번역 키 추가 및 자동 번역
    ↓
Task 5: 빌드 및 검증
```

### Agent Dispatch Summary

| Task | Description | Recommended Agent |
|------|-------------|-------------------|
| 1 | HTML 구조 생성 | delegate_task(category="visual-engineering", load_skills=["frontend-ui-ux"]) |
| 2 | JS 로직 통합 | delegate_task(category="quick", load_skills=[]) |
| 3 | index.html 수정 | delegate_task(category="quick", load_skills=[]) |
| 4 | i18n 추가 | delegate_task(category="quick", load_skills=[]) |
| 5 | 빌드 검증 | delegate_task(category="quick", load_skills=[]) |

---

## TODOs

- [ ] 1. Settings HTML - 통합 UI 구조 생성

  **What to do**:
  - Integrations 섹션(602-641)과 Data Sync 섹션(643-703)을 하나의 "연동" 섹션으로 통합
  - 기존 `settings.integrations` i18n 키 그대로 사용 (섹션 제목)
  - 섹션 상단에 설명 문구 추가: "이슈 작성 시 관련 대화/문서를 자동 찾아주는 AI 검색에 사용됩니다"
  - OpenAI Key 입력 필드를 섹션 상단에 배치 (설명 문구 아래)
  - 각 서비스별 통합 행 생성 (Slack, Notion, Gmail) - 아래 레이아웃 참고
  - Linear는 별도 행으로 유지 (⋮ 메뉴 없이 동기화 버튼만)
  - ⋮ 드롭다운 메뉴 HTML 구조 추가

  **통합 행 레이아웃 (연동 후 상태)**:
  ```
  [아이콘] [서비스명] [워크스페이스명] [123 docs] ─────── [2분 전] [동기화] [⋮]
  ```

  **HTML 구조 예시 (Slack 연동 후)**:
  ```html
  <div class="integration-row" id="slackRow">
    <svg class="integration-logo">...</svg>
    <span class="integration-name">Slack</span>
    <span class="integration-workspace" id="slackWorkspace">GPTers</span>
    <span class="integration-doc-count" id="slackDocCount">123 docs</span>
    <span class="integration-spacer"></span>
    <span class="integration-last-sync" id="slackLastSync">2분 전</span>
    <button class="btn-sync" id="syncSlackBtn">동기화</button>
    <div class="integration-menu">
      <button class="btn-menu-trigger" id="slackMenuBtn">⋮</button>
      <div class="menu-dropdown" id="slackMenuDropdown">
        <button class="menu-item" data-action="reconnect">워크스페이스 변경</button>
        <button class="menu-item" data-action="disconnect">연결 해제</button>
      </div>
    </div>
  </div>
  ```

  **HTML 구조 예시 (미연동 상태)**:
  ```html
  <div class="integration-row" id="slackRow">
    <svg class="integration-logo">...</svg>
    <span class="integration-name">Slack</span>
    <span class="integration-status" id="slackStatusText">연결 안됨</span>
    <span class="integration-spacer"></span>
    <button class="btn-integration" id="slackConnectBtn">연동</button>
  </div>
  ```

  **Linear 행 (별도 처리)**:
  ```html
  <div class="integration-row" id="linearRow">
    <svg class="integration-logo">...</svg>
    <span class="integration-name">Linear</span>
    <span class="integration-doc-count" id="linearDocCount">45 docs</span>
    <span class="integration-spacer"></span>
    <span class="integration-last-sync" id="linearLastSync">5분 전</span>
    <button class="btn-sync" id="syncLinearBtn">동기화</button>
    <!-- ⋮ 메뉴 없음 - Linear는 API 토큰 기반이므로 연결 해제 불필요 -->
  </div>
  ```

  **Must NOT do**:
  - 기존 element ID 변경 금지 (slackConnectBtn, syncSlackBtn 등 유지)
  - CSS 클래스 네이밍 규칙 유지 (btn-integration, sync-* 패턴)
  - sync-section 클래스 완전 제거 (integrations-section으로 통합)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI 레이아웃 변경 및 새로운 드롭다운 컴포넌트 구현
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: UI/UX 패턴 및 접근성 고려

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:

  **Pattern References (HTML)**:
  - `src/renderer/settings.html:602-641` - 현재 Integrations 섹션 구조
  - `src/renderer/settings.html:643-703` - 현재 Data Sync 섹션 구조
  - `src/renderer/settings.html:649-652` - OpenAI Key 입력 필드 패턴

  **Pattern References (CSS)**:
  - `src/renderer/settings.html:330-422` - 기존 integration-row CSS 스타일
  - `src/renderer/settings.html:424-567` - sync-section 관련 CSS (참고용)
  - `src/renderer/index.html:675-750` - label-dropdown 패턴 (드롭다운 참고)

  **CSS 클래스 참조**:
  - `.integration-row` - 기존 행 스타일
  - `.btn-integration` - 연동 버튼 스타일
  - `.btn-sync` - 동기화 버튼 스타일
  - `.sync-source-count` - 문서 수 표시 스타일 (재활용)

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 섹션 통합 확인
    Tool: Grep
    Steps:
      1. Grep "integrations-section" in src/renderer/settings.html
         → Assert: 정확히 1회 매치
      2. Grep "sync-section" in src/renderer/settings.html
         → Assert: 0회 매치 (제거되어야 함)
    Expected Result: 두 섹션이 하나로 통합됨

  Scenario: 드롭다운 메뉴 HTML 존재 확인
    Tool: Grep
    Steps:
      1. Grep "menu-dropdown" in src/renderer/settings.html
         → Assert: 3회 이상 매치 (Slack, Notion, Gmail)
      2. Grep "btn-menu-trigger" in src/renderer/settings.html
         → Assert: 3회 이상 매치
    Expected Result: 3개 서비스에 드롭다운 구조 존재

  Scenario: OpenAI Key 섹션 내부 배치 확인
    Tool: Read
    Steps:
      1. Read src/renderer/settings.html
      2. openaiKeyInput이 integrations-section 내부에 있는지 확인
    Expected Result: OpenAI Key가 연동 섹션 내부에 있음

  Scenario: Linear 행에 메뉴 없음 확인
    Tool: Grep
    Steps:
      1. Grep "linearMenuBtn" in src/renderer/settings.html
         → Assert: 0회 매치 (Linear에는 메뉴 없어야 함)
    Expected Result: Linear 행에 ⋮ 메뉴 없음
  ```

  **Commit**: YES
  - Message: `feat(settings): merge integrations and sync into unified section`
  - Files: `src/renderer/settings.html`
  - Pre-commit: `npm run build`

---

- [ ] 2. Settings JS - 로직 통합

  **What to do**:
  - updateSlackUI, updateNotionUI, updateGmailUI 함수를 확장하여 통합 행 상태 표시:
    - 미연동: 연동 버튼만 표시
    - 연동됨: 워크스페이스명 + 문서수 + 마지막 동기화 시간 + 동기화 버튼 + ⋮ 메뉴
  - ⋮ 드롭다운 메뉴 **클릭 토글** 로직 추가:
    - ⋮ 버튼 클릭 → 메뉴 열림
    - 다시 클릭 또는 외부 클릭 → 메뉴 닫힘
  - 메뉴 항목 클릭 핸들러 추가:
    - "워크스페이스 변경" → 기존 connect IPC 호출 (재연동)
    - "연결 해제" → 기존 disconnect IPC 호출

  **드롭다운 메뉴 JS 로직 예시**:
  ```javascript
  // 메뉴 토글 (클릭 방식)
  document.querySelectorAll('.btn-menu-trigger').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = btn.nextElementSibling;
      const isOpen = dropdown.classList.contains('open');
      
      // 다른 열린 메뉴 닫기
      document.querySelectorAll('.menu-dropdown.open').forEach(d => d.classList.remove('open'));
      
      // 토글
      if (!isOpen) dropdown.classList.add('open');
    });
  });

  // 외부 클릭 시 닫기
  document.addEventListener('click', () => {
    document.querySelectorAll('.menu-dropdown.open').forEach(d => d.classList.remove('open'));
  });

  // 메뉴 항목 클릭
  document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = item.dataset.action;
      const service = item.closest('.integration-row').dataset.service;
      
      if (action === 'reconnect') {
        await ipcRenderer.invoke(`${service}-connect`);
      } else if (action === 'disconnect') {
        await ipcRenderer.invoke(`${service}-disconnect`);
      }
      
      // 메뉴 닫기
      item.closest('.menu-dropdown').classList.remove('open');
    });
  });
  ```

  **Must NOT do**:
  - IPC 핸들러 변경 금지
  - 기존 이벤트 리스너 패턴 유지
  - 새로운 라이브러리 추가 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 기존 패턴을 따르는 간단한 JS 로직 추가
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:

  **Pattern References (기존 JS 로직)**:
  - `src/renderer/settings.html:1198-1265` - Slack 연동 JS 로직 (updateSlackUI 함수)
  - `src/renderer/settings.html:1285-1370` - Notion 연동 JS 로직 (updateNotionUI 함수)
  - `src/renderer/settings.html:1372-1456` - Gmail 연동 JS 로직 (updateGmailUI 함수)
  - `src/renderer/settings.html:1528-1597` - loadSyncStatus 함수 (동기화 상태 로드)

  **Pattern References (IPC 호출)**:
  - `src/renderer/settings.html:1530-1535` - 연동 상태 조회 패턴:
    ```javascript
    const [slackStatus, notionStatus, gmailStatus] = await Promise.all([
      ipcRenderer.invoke('slack-status'),
      ipcRenderer.invoke('notion-status'),
      ipcRenderer.invoke('gmail-status'),
    ]);
    ```

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 드롭다운 메뉴 클릭 토글 로직 존재
    Tool: Grep
    Steps:
      1. Grep "btn-menu-trigger" AND "addEventListener" in settings.html
         → Assert: 1회 이상 매치
      2. Grep "classList.add('open')" OR "classList.toggle" in settings.html
         → Assert: 메뉴 열기 로직 존재
    Expected Result: 클릭 토글 이벤트 리스너 존재

  Scenario: 외부 클릭 닫기 로직 존재
    Tool: Grep
    Steps:
      1. Grep "document.addEventListener.*click" in settings.html
         → Assert: 1회 이상 매치
      2. Grep "menu-dropdown.*open" AND "remove" in settings.html
         → Assert: 메뉴 닫기 로직 존재
    Expected Result: 외부 클릭 시 메뉴 닫기 로직 존재

  Scenario: 메뉴 항목 액션 핸들러 존재
    Tool: Grep
    Steps:
      1. Grep "data-action" AND "reconnect" in settings.html
         → Assert: 워크스페이스 변경 액션 존재
      2. Grep "data-action" AND "disconnect" in settings.html
         → Assert: 연결 해제 액션 존재
    Expected Result: 메뉴 항목 클릭 핸들러 존재
  ```

  **Commit**: YES
  - Message: `feat(settings): add dropdown menu JS logic for unified rows`
  - Files: `src/renderer/settings.html`
  - Pre-commit: `npm run build`

---

- [ ] 3. Main UI - 컨텍스트 섹션 개선

  **What to do**:
  - relatedContextSection 제목 변경: "📎 Slack/Notion/Gmail에서 관련 내용 찾기"
  - 미연동 시 안내 배너 추가: 메시지 + **설정 열기 버튼**
  - 연동 상태 확인 로직 추가 (IPC로 서비스별 연동 상태 조회)
  - 모든 서비스 미연동 시에만 안내 배너 표시

  **미연동 안내 UI 구조**:
  ```html
  <div id="relatedContextNotConnected" class="related-context-not-connected" style="display: none;">
    <span class="not-connected-icon">🔗</span>
    <span class="not-connected-text" data-i18n="relatedContext.notConnectedHint">
      설정에서 연동 후 사용 가능합니다
    </span>
    <button class="not-connected-btn" id="openSettingsFromContext" data-i18n="common.settings">
      설정 열기
    </button>
  </div>
  ```

  **연동 상태 확인 JS 로직**:
  ```javascript
  // index.html에서 연동 상태 확인
  async function checkIntegrationStatus() {
    const [slackStatus, notionStatus, gmailStatus] = await Promise.all([
      ipcRenderer.invoke('slack-status'),
      ipcRenderer.invoke('notion-status'),
      ipcRenderer.invoke('gmail-status'),
    ]);
    
    const anyConnected = slackStatus.connected || notionStatus.connected || gmailStatus.connected;
    
    const notConnectedBanner = document.getElementById('relatedContextNotConnected');
    if (!anyConnected) {
      notConnectedBanner.style.display = 'flex';
    } else {
      notConnectedBanner.style.display = 'none';
    }
  }
  
  // 설정 열기 버튼
  document.getElementById('openSettingsFromContext').addEventListener('click', () => {
    ipcRenderer.invoke('open-settings');
  });
  ```

  **Must NOT do**:
  - 검색 로직 변경 금지
  - 결과 표시 UI 변경 금지
  - 기존 related-context-empty 스타일 변경 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 제목 텍스트 및 조건부 표시 로직만 추가
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **References**:

  **Pattern References (HTML)**:
  - `src/renderer/index.html:1413-1468` - 현재 Related Context 섹션
  - `src/renderer/index.html:1356-1362` - Token warning 배너 패턴 (유사한 조건부 UI)

  **Pattern References (IPC 호출)**:
  - `src/renderer/settings.html:1530-1535` - 연동 상태 조회 패턴 (동일하게 사용):
    ```javascript
    const [slackStatus, notionStatus, gmailStatus] = await Promise.all([
      ipcRenderer.invoke('slack-status'),
      ipcRenderer.invoke('notion-status'),
      ipcRenderer.invoke('gmail-status'),
    ]);
    ```
  - `src/renderer/index.html:1681-1683` - settingsBtn 클릭 시 open-settings 호출 패턴

  **CSS 클래스 참조**:
  - `.related-context-header-title` - 제목 스타일
  - `.related-context-empty` - 빈 상태 스타일 (참고용)
  - `.token-warning` - 경고 배너 스타일 (유사하게 스타일링)

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 새 제목 i18n 키 확인
    Tool: Grep
    Steps:
      1. Grep "relatedContext.findFrom" in index.html
         → Assert: 1회 이상 매치
    Expected Result: 새 제목 i18n 키가 반영됨

  Scenario: 미연동 안내 배너 존재
    Tool: Grep
    Steps:
      1. Grep "relatedContextNotConnected" in index.html
         → Assert: 1회 이상 매치 (element ID)
      2. Grep "relatedContext.notConnectedHint" in index.html
         → Assert: 1회 이상 매치 (i18n 키)
    Expected Result: 미연동 안내 div 존재

  Scenario: 설정 열기 버튼 존재
    Tool: Grep
    Steps:
      1. Grep "openSettingsFromContext" in index.html
         → Assert: 1회 이상 매치 (button ID)
      2. Grep "open-settings" in index.html
         → Assert: 2회 이상 매치 (기존 settingsBtn + 새 버튼)
    Expected Result: 설정 열기 버튼이 추가됨

  Scenario: 연동 상태 확인 IPC 호출 존재
    Tool: Grep
    Steps:
      1. Grep "slack-status" in index.html
         → Assert: 1회 이상 매치
      2. Grep "notion-status" in index.html
         → Assert: 1회 이상 매치
    Expected Result: 연동 상태 확인 로직 존재
  ```

  **Commit**: YES
  - Message: `feat(main): improve related context section title and guidance`
  - Files: `src/renderer/index.html`
  - Pre-commit: `npm run build`

---

- [ ] 4. i18n - 번역 키 추가

  **What to do**:
  - en/translation.json에 새 키 추가 (기존 키는 유지):
    - `settings.integrationHint`: "Used for AI search to automatically find related conversations and documents when creating issues"
    - `settings.changeWorkspace`: "Change workspace"
    - `relatedContext.findFrom`: "📎 Find related content from Slack/Notion/Gmail"
    - `relatedContext.notConnectedHint`: "Connect services in Settings to use this feature"
    - `relatedContext.openSettings`: "Open Settings"
  - ko/translation.json에 한국어 번역 추가:
    - `settings.integrationHint`: "이슈 작성 시 관련 대화/문서를 자동 찾아주는 AI 검색에 사용됩니다"
    - `settings.changeWorkspace`: "워크스페이스 변경"
    - `relatedContext.findFrom`: "📎 Slack/Notion/Gmail에서 관련 내용 찾기"
    - `relatedContext.notConnectedHint`: "설정에서 연동 후 사용 가능합니다"
    - `relatedContext.openSettings`: "설정 열기"
  - `npm run translate` 실행하여 de, fr, es 자동 번역
  - `npm run validate:i18n` 실행하여 누락 키 확인

  **기존 키 활용 (변경 없음)**:
  - `settings.integrations` - 섹션 제목으로 그대로 사용
  - `common.disconnect` - ⋮ 메뉴의 "연결 해제"에 사용
  - `common.settings` - 설정 열기 버튼에 사용 가능

  **Must NOT do**:
  - 기존 키 이름 변경 금지
  - 기존 키 값 변경 금지
  - 수동으로 de/fr/es 번역 금지 (자동 번역 사용)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: JSON 파일 편집 및 스크립트 실행
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 5
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `locales/en/translation.json:95-116` - settings 섹션 구조
  - `locales/en/translation.json:213-223` - relatedContext 섹션 구조
  - `locales/ko/translation.json` - 한국어 번역 구조 (동일 구조)

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 영어 키 추가 확인
    Tool: Grep
    Steps:
      1. Grep "integrationHint" in locales/en/translation.json
         → Assert: 1회 매치
      2. Grep "changeWorkspace" in locales/en/translation.json
         → Assert: 1회 매치
      3. Grep "findFrom" in locales/en/translation.json
         → Assert: 1회 매치
      4. Grep "notConnectedHint" in locales/en/translation.json
         → Assert: 1회 매치
    Expected Result: 새 키들이 en에 존재

  Scenario: 한국어 번역 확인
    Tool: Grep
    Steps:
      1. Grep "integrationHint" in locales/ko/translation.json
         → Assert: 1회 매치
      2. Grep "워크스페이스 변경" in locales/ko/translation.json
         → Assert: 1회 매치
    Expected Result: ko에 한국어 번역 존재

  Scenario: i18n 검증 통과
    Tool: Bash
    Steps:
      1. Run: npm run validate:i18n
         → Assert: Exit code 0
         → Assert: 출력에 "missing" 또는 "error" 없음
    Expected Result: 검증 통과
  ```

  **Commit**: YES
  - Message: `feat(i18n): add translation keys for unified integration UI`
  - Files: `locales/en/translation.json`, `locales/ko/translation.json`, `locales/de/translation.json`, `locales/fr/translation.json`, `locales/es/translation.json`
  - Pre-commit: `npm run validate:i18n`

---

- [ ] 5. 빌드 및 최종 검증

  **What to do**:
  - `npm run pack:clean` 실행하여 앱 빌드 및 실행
  - 빌드 성공 확인
  - 앱이 정상 실행되는지 확인 (크래시 없음)

  **Must NOT do**:
  - 코드 수정 없음 (검증만)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 빌드 명령 실행 및 결과 확인
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (final)
  - **Blocks**: None
  - **Blocked By**: Task 4

  **References**:

  **Documentation References**:
  - `CLAUDE.md` - 테스트 원칙, npm run pack:clean 사용 규칙

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 빌드 성공
    Tool: Bash
    Steps:
      1. Run: npm run pack:clean
      2. Assert: Exit code 0
      3. Assert: release/mac-arm64/Linear Capture.app exists
    Expected Result: 빌드 성공, 앱 파일 생성됨

  Scenario: 앱 실행 확인
    Tool: Bash
    Steps:
      1. Check: Process "Linear Capture" is running (via ps)
      2. Assert: Process exists
    Expected Result: 앱이 실행 중
  ```

  **Commit**: NO
  - 검증만 수행, 추가 커밋 없음

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `feat(settings): merge integrations and sync into unified section` | settings.html | npm run build |
| 2 | `feat(settings): add dropdown menu JS logic for unified rows` | settings.html | npm run build |
| 3 | `feat(main): improve related context section title and guidance` | index.html | npm run build |
| 4 | `feat(i18n): add translation keys for unified integration UI` | locales/*.json | npm run validate:i18n |
| 5 | - | - | npm run pack:clean |

---

## Success Criteria

### Verification Commands
```bash
npm run build              # Expected: TypeScript 컴파일 성공
npm run validate:i18n      # Expected: 누락 키 없음
npm run pack:clean         # Expected: 앱 빌드 및 실행 성공
```

### Final Checklist
- [ ] Settings에서 "연동" 단일 섹션으로 통합됨 (sync-section 제거됨)
- [ ] 각 서비스가 연동 상태에 따라 다르게 표시됨:
  - 미연동: `[아이콘] [서비스명] [상태] --- [연동 버튼]`
  - 연동됨: `[아이콘] [서비스명] [워크스페이스] [문서수] --- [시간] [동기화] [⋮]`
- [ ] ⋮ 메뉴가 클릭 토글로 정상 작동함 (Slack, Notion, Gmail만)
- [ ] Linear 행은 동기화 버튼만 표시됨 (⋮ 메뉴 없음)
- [ ] OpenAI Key가 연동 섹션 내부에 있음
- [ ] 메인 UI 컨텍스트 섹션 제목이 "📎 Slack/Notion/Gmail에서 관련 내용 찾기"로 변경됨
- [ ] 미연동 시 안내 + 설정 열기 버튼이 표시됨
- [ ] 모든 번역이 적용됨 (en, ko + 자동번역 de, fr, es)
