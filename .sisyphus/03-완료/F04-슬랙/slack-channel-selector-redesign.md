# Slack Channel Selector UI Redesign

## TL;DR

> **Quick Summary**: Slack 채널 선택기를 inline collapsible에서 modal 기반으로 변경하여 다른 integration(Notion, Gmail)과 시각적 일관성 유지
> 
> **Deliverables**:
> - Settings 페이지에서 Slack row에 간결한 채널 요약 표시 ("12/45 channels [Edit]")
> - [Edit] 클릭 시 모달에서 채널 선택
> - 기존 post-OAuth 모달 동작 유지
> 
> **Estimated Effort**: Short (2-3 hours)
> **Parallel Execution**: NO - sequential (단일 파일 수정)
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4

---

## Context

### Original Request
커밋 `0213d3a` 후 슬랙 채널 선택 UI가 너무 많은 영역을 차지하여 다른 integration과 불균형. 개선 필요.

### Interview Summary
**Key Discussions**:
- 핵심 문제: Slack만 거대한 채널 선택기로 시각적 불균형
- 채널 규모: 10-50개 (중규모 워크스페이스)
- 방향: 모달로 분리, 메인에는 카운트만 표시

**Research Findings**:
- Baymard UX: 10개 이상 옵션은 modal/autocomplete 권장
- Mattermost: modal + checkbox list + search 패턴 사용
- 기존 `#channelSelectionModal` 재활용 가능

### Metis Review
**Identified Gaps** (addressed):
- Modal mode 파라미터 필요 (post-oauth vs edit) → Task 1에서 처리
- Cancel vs Skip 동작 차이 → mode별 분기 처리
- 로딩 상태 미정의 → Default 적용 (Loading... + 버튼 비활성화)
- 0 채널 선택 허용 여부 → Default 적용 (허용, 별도 경고 없음)

---

## Work Objectives

### Core Objective
Slack 채널 선택 UI를 inline collapsible에서 modal 기반으로 변경하여 Settings 페이지의 integration row 일관성 확보

### Concrete Deliverables
- `src/renderer/settings.html` 수정:
  - Slack row 하단에 채널 요약 행 추가
  - 기존 `#slackChannelSelector` collapsible 영역 제거/숨김
  - Modal open 함수에 mode 파라미터 추가

### Definition of Done
- [ ] Slack 연결 시 요약 행에 "X/Y channels [Edit]" 표시
- [ ] [Edit] 클릭 → 모달 열림, 현재 선택 상태 반영
- [ ] 모달 Cancel → 변경사항 취소
- [ ] 모달 Save → 변경사항 저장, 요약 업데이트
- [ ] post-OAuth 모달 동작 기존과 동일 (Skip = 모두 선택)
- [ ] `npm run pack:clean` 테스트 통과

### Must Have
- 모달에서 검색, 전체 선택/해제, 카운트 표시
- post-OAuth 플로우 기존 동작 유지
- Notion/Gmail row와 유사한 높이의 요약 행

### Must NOT Have (Guardrails)
- IPC 핸들러 변경 금지 (기존 `slack-channels`, `sync:get/set-slack-channels` 유지)
- `renderChannelList()` 함수 시그니처 변경 금지
- post-OAuth 모달의 Skip 동작 변경 금지 (Skip = 모두 저장)
- 새로운 npm 의존성 추가 금지
- Notion/Gmail UI 변경 금지
- 채널 그룹핑, 추천 기능 등 새 기능 추가 금지

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> 모든 검증은 Agent가 직접 수행 (Playwright, interactive_bash, curl 등)

### Test Decision
- **Infrastructure exists**: NO (Electron 앱, 단위 테스트 없음)
- **Automated tests**: None
- **Framework**: none
- **Verification**: Agent-Executed QA Scenarios (Playwright)

### Agent-Executed QA Scenarios (MANDATORY)

**Verification Tool**: Playwright (playwright skill)
- Electron 앱 빌드 후 실행
- DOM 검사 및 인터랙션
- 스크린샷 캡처

---

## Execution Strategy

### Sequential Execution (No Parallelization)

```
Task 1: Modal mode 파라미터 추가
    ↓
Task 2: 채널 요약 행 HTML/CSS 추가  
    ↓
Task 3: 요약 행 JavaScript 로직
    ↓
Task 4: Inline selector 숨김 및 정리
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize |
|------|------------|--------|-----------------|
| 1 | None | 2, 3 | No (same file) |
| 2 | 1 | 3 | No (same file) |
| 3 | 2 | 4 | No (same file) |
| 4 | 3 | None | No (same file) |

---

## TODOs

- [ ] 1. Modal mode 파라미터 추가

  **What to do**:
  - `showChannelSelectionModal(mode)` 함수에 mode 파라미터 추가 (`'post-oauth'` | `'edit'`)
  - mode에 따라 Cancel/Skip 버튼 텍스트 및 동작 분기:
    - `'post-oauth'`: Skip = 모두 저장 (기존 동작)
    - `'edit'`: Cancel = 변경 취소 (모달 닫기만)
  - 기존 `showChannelSelectionModal()` 호출부를 `showChannelSelectionModal('post-oauth')`로 변경

  **Must NOT do**:
  - post-OAuth 모달의 기존 동작 변경 금지
  - `renderChannelList()` 시그니처 변경 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단일 파일 내 함수 수정, 간단한 분기 로직 추가
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Modal 인터랙션 패턴 이해 필요

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 2, 3
  - **Blocked By**: None

  **References**:
  
  **Pattern References**:
  - `src/renderer/settings.html:1920-1980` - 기존 `showChannelSelectionModal()` 함수 및 호출부

  **API/Type References**:
  - `src/renderer/settings.html:1077-1099` - `#channelSelectionModal` HTML 구조
  - `src/renderer/settings.html:1775-1820` - Modal 버튼 이벤트 핸들러 (modalSkipBtn, modalSaveBtn)

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: post-OAuth 모달에서 Skip 클릭 시 모든 채널 저장
    Tool: Playwright (playwright skill)
    Preconditions: 앱 빌드 완료, Slack 연결 상태
    Steps:
      1. DevTools 콘솔에서 showChannelSelectionModal('post-oauth') 호출
      2. Wait for: #channelSelectionModal visible (timeout: 5s)
      3. Assert: #modalSkipBtn text contains "Skip"
      4. Click: #modalSkipBtn
      5. Wait for: modal hidden (timeout: 3s)
      6. DevTools에서 selectedChannelIds.size 확인
      7. Assert: 선택된 채널 수 = 전체 채널 수
    Expected Result: Skip 클릭 시 모든 채널이 선택된 상태로 저장
    Evidence: .sisyphus/evidence/task-1-post-oauth-skip.png

  Scenario: edit 모달에서 Cancel 클릭 시 변경 취소
    Tool: Playwright (playwright skill)
    Preconditions: 앱 빌드 완료, Slack 연결 상태, 일부 채널 선택됨
    Steps:
      1. DevTools 콘솔에서 현재 selectedChannelIds.size 기록 (예: 5)
      2. showChannelSelectionModal('edit') 호출
      3. Wait for: #channelSelectionModal visible
      4. Assert: #modalSkipBtn text contains "Cancel" (또는 i18n 키)
      5. Click: 선택 안 된 채널 3개 체크
      6. Click: #modalSkipBtn (Cancel)
      7. Wait for: modal hidden
      8. Assert: selectedChannelIds.size === 5 (변경 전과 동일)
    Expected Result: Cancel 시 변경사항 버려짐
    Evidence: .sisyphus/evidence/task-1-edit-cancel.png
  ```

  **Commit**: NO (groups with Task 4)

---

- [ ] 2. 채널 요약 행 HTML/CSS 추가

  **What to do**:
  - `#slackChannelSelector` 위치에 새로운 요약 행 HTML 추가:
    ```html
    <div id="slackChannelSummary" class="channel-summary-row" style="display: none;">
      <span class="channel-summary-icon">📺</span>
      <span id="channelSummaryText" class="channel-summary-text">0/0 channels</span>
      <button id="editChannelsBtn" class="btn-edit" data-i18n="slack.editChannels">Edit</button>
    </div>
    ```
  - CSS 스타일 추가:
    - `.channel-summary-row`: Notion/Gmail row와 유사한 패딩, 높이
    - `.btn-edit`: 작은 링크 스타일 버튼
  - i18n 키 추가: `slack.editChannels` = "Edit"

  **Must NOT do**:
  - 기존 `#slackChannelSelector` HTML 삭제하지 말 것 (Task 4에서 처리)
  - 다른 integration row 스타일 변경 금지

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: HTML/CSS 레이아웃 작업, 시각적 일관성 필요
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: 디자인 시스템 일관성, 스타일링 패턴

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `src/renderer/settings.html:972-1031` - Notion/Gmail integration row HTML 구조 (높이, 패딩 참고)
  - `src/renderer/settings.html:420-485` - `.integration-row` CSS 스타일

  **API/Type References**:
  - `locales/en/translation.json:152` - 기존 `slack.channelsSelected` 형식 참고
  - `locales/ko/translation.json:148-152` - 한국어 번역 키 구조

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: 요약 행이 Notion row와 동일한 높이
    Tool: Playwright (playwright skill)
    Preconditions: 앱 빌드 완료
    Steps:
      1. Navigate to: Settings 페이지
      2. DevTools에서 #notionRow의 offsetHeight 측정
      3. DevTools에서 #slackChannelSummary의 offsetHeight 측정
      4. Assert: 두 높이 차이 < 10px
    Expected Result: 요약 행이 다른 integration row와 시각적으로 일관됨
    Evidence: .sisyphus/evidence/task-2-row-height.png

  Scenario: Edit 버튼 스타일 확인
    Tool: Playwright (playwright skill)
    Steps:
      1. Navigate to: Settings 페이지
      2. Screenshot: #slackChannelSummary 영역
      3. Assert: #editChannelsBtn visible
      4. Assert: #editChannelsBtn cursor is pointer (CSS 검사)
    Expected Result: Edit 버튼이 클릭 가능한 스타일로 표시
    Evidence: .sisyphus/evidence/task-2-edit-button.png
  ```

  **Commit**: NO (groups with Task 4)

---

- [ ] 3. 요약 행 JavaScript 로직

  **What to do**:
  - `updateSlackUI()` 함수 수정:
    - Slack 연결 시 `#slackChannelSummary` 표시
    - Slack 미연결 시 `#slackChannelSummary` 숨김
  - `updateChannelSummary()` 함수 추가:
    - `selectedChannelIds.size` / `allSlackChannels.length` 형식으로 텍스트 업데이트
    - 로딩 중일 때 "Loading..." 표시 및 Edit 버튼 비활성화
  - `#editChannelsBtn` 클릭 핸들러:
    - `showChannelSelectionModal('edit')` 호출
  - 모달 Save 시 `updateChannelSummary()` 호출하여 카운트 업데이트

  **Must NOT do**:
  - `renderChannelList()` 함수 수정 금지
  - IPC 호출 추가/변경 금지

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 기존 패턴 따라 함수 추가, 이벤트 핸들러 연결
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: DOM 조작, 상태 관리 패턴

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 4
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `src/renderer/settings.html:1633-1662` - `updateSlackUI()` 함수 (연결 상태별 UI 토글 패턴)
  - `src/renderer/settings.html:1820-1835` - `updateChannelCount()` 함수 (카운트 업데이트 패턴)

  **API/Type References**:
  - `src/renderer/settings.html:1571-1572` - `allSlackChannels`, `selectedChannelIds` 전역 변수

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Edit 버튼 클릭 시 모달 열림
    Tool: Playwright (playwright skill)
    Preconditions: 앱 빌드 완료, Slack 연결 상태
    Steps:
      1. Navigate to: Settings 페이지
      2. Wait for: #slackChannelSummary visible
      3. Click: #editChannelsBtn
      4. Wait for: #channelSelectionModal visible (timeout: 3s)
      5. Assert: modal 내 채널 리스트 표시됨
      6. Screenshot: 모달 상태
    Expected Result: Edit 클릭 시 채널 선택 모달 열림
    Evidence: .sisyphus/evidence/task-3-edit-modal-open.png

  Scenario: 모달 Save 후 요약 카운트 업데이트
    Tool: Playwright (playwright skill)
    Preconditions: 앱 빌드 완료, Slack 연결, 5/20 채널 선택됨
    Steps:
      1. Navigate to: Settings 페이지
      2. Assert: #channelSummaryText contains "5/20"
      3. Click: #editChannelsBtn
      4. Wait for: modal visible
      5. Click: 선택 안 된 채널 3개 체크
      6. Click: #modalSaveBtn
      7. Wait for: modal hidden
      8. Assert: #channelSummaryText contains "8/20"
    Expected Result: Save 후 요약 텍스트가 새 카운트로 업데이트
    Evidence: .sisyphus/evidence/task-3-save-count-update.png

  Scenario: 로딩 중 Edit 버튼 비활성화
    Tool: Playwright (playwright skill)
    Preconditions: 앱 빌드 완료, Slack 연결
    Steps:
      1. DevTools에서 allSlackChannels = [] 설정 (로딩 시뮬레이션)
      2. updateChannelSummary() 호출
      3. Assert: #editChannelsBtn.disabled === true
      4. Assert: #channelSummaryText contains "Loading"
    Expected Result: 채널 로딩 중 Edit 버튼 비활성화
    Evidence: .sisyphus/evidence/task-3-loading-state.png
  ```

  **Commit**: NO (groups with Task 4)

---

- [ ] 4. Inline selector 숨김 및 정리

  **What to do**:
  - `#slackChannelSelector` (기존 collapsible 영역)를 `display: none !important`로 숨김
  - 또는 HTML에서 완전히 제거 (CSS는 유지 - 모달에서 사용)
  - `toggleChannelSelector()` 함수 호출부 제거 (더 이상 필요 없음)
  - 불필요한 inline selector 전용 이벤트 핸들러 정리

  **Must NOT do**:
  - `.channel-selector` CSS 삭제 금지 (모달 내부에서 유사 스타일 사용 가능)
  - `renderChannelList()` 함수 삭제 금지 (모달에서 사용)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: HTML 제거/숨김, 간단한 정리 작업
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: 코드 정리, 레거시 제거 패턴

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (final)
  - **Blocks**: None
  - **Blocked By**: Task 3

  **References**:

  **Pattern References**:
  - `src/renderer/settings.html:949-971` - `#slackChannelSelector` HTML (제거/숨김 대상)
  - `src/renderer/settings.html:1574-1576` - `toggleChannelSelector()` 함수 (제거 대상)

  **Acceptance Criteria**:

  **Agent-Executed QA Scenarios:**

  ```
  Scenario: Inline selector가 더 이상 표시되지 않음
    Tool: Playwright (playwright skill)
    Preconditions: 앱 빌드 완료, Slack 연결 상태
    Steps:
      1. Navigate to: Settings 페이지
      2. Wait for: Slack row visible
      3. Assert: #slackChannelSelector not visible (display: none 또는 제거됨)
      4. Assert: #slackChannelSummary visible
      5. Screenshot: Slack 섹션 전체
    Expected Result: Collapsible selector 대신 요약 행만 표시
    Evidence: .sisyphus/evidence/task-4-inline-hidden.png

  Scenario: 전체 Settings 페이지 레이아웃 확인
    Tool: Playwright (playwright skill)
    Steps:
      1. Navigate to: Settings 페이지
      2. Screenshot: 전체 페이지
      3. Assert: Slack row 높이가 Notion, Gmail row와 유사
      4. Assert: 시각적 일관성 확인
    Expected Result: 모든 integration row가 일관된 높이와 스타일
    Evidence: .sisyphus/evidence/task-4-full-layout.png

  Scenario: post-OAuth 플로우 여전히 동작
    Tool: Playwright (playwright skill)
    Preconditions: Slack 미연결 상태
    Steps:
      1. Navigate to: Settings 페이지
      2. Click: Slack Connect 버튼
      3. OAuth 플로우 완료 시뮬레이션 (IPC 이벤트)
      4. Wait for: #channelSelectionModal visible
      5. Assert: #modalSkipBtn text contains "Skip"
      6. Click: #modalSkipBtn
      7. Assert: 모든 채널 선택됨
    Expected Result: post-OAuth 모달 기존 동작 유지
    Evidence: .sisyphus/evidence/task-4-post-oauth-flow.png
  ```

  **Commit**: YES
  - Message: `refactor(settings): move Slack channel selector to modal for UI consistency`
  - Files: `src/renderer/settings.html`
  - Pre-commit: `npm run build`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 4 | `refactor(settings): move Slack channel selector to modal for UI consistency` | `src/renderer/settings.html` | `npm run pack:clean` |

---

## Success Criteria

### Verification Commands
```bash
npm run pack:clean  # 빌드 + 앱 실행
# Expected: 앱이 정상 실행되고 Settings 페이지에서:
# - Slack row에 요약 행 표시
# - Edit 클릭 시 모달 열림
# - 모달에서 채널 선택/저장 동작
```

### Final Checklist
- [ ] Slack 요약 행이 "X/Y channels [Edit]" 형식으로 표시
- [ ] Edit 클릭 시 모달 열림
- [ ] 모달 Cancel 시 변경 취소
- [ ] 모달 Save 시 저장 및 요약 업데이트
- [ ] post-OAuth 플로우 기존 동작 유지
- [ ] Slack row 높이가 Notion/Gmail과 유사
- [ ] Collapsible inline selector 숨겨짐/제거됨
