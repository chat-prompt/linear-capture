# Slack 채널 선택 UI 추가

## TL;DR

> **Quick Summary**: Slack 연동 시 채널 선택 UI를 추가하여 사용자가 원하는 채널만 검색 범위에 포함할 수 있게 함. 기본값은 전체 채널 선택 (opt-out 방식).
> 
> **Deliverables**:
> - OAuth 완료 후 채널 선택 모달
> - Settings에서 채널 목록 관리 UI
> - 검색 로직 버그 수정 (빈 배열 = 전체 포함)
> 
> **Estimated Effort**: Medium (4-6시간)
> **Parallel Execution**: YES - Wave 1 병렬 (Task 1 + Task 4)
> **Critical Path**: Task 1 + Task 4 (병렬) → Task 2 (Settings UI) → Task 3 (OAuth 모달)

---

## Context

### Original Request
Slack 연동 시 모든 채널이 기본 선택되어 있고, 원하지 않는 채널을 제외하는 방식의 채널 선택 UI 추가

### Interview Summary
**Key Discussions**:
- 채널 선택 방식: Opt-out (기본 전체 선택, 제외할 것만 해제)
- 비공개 채널: 포함 (봇이 참여한 채널)
- UI 표시 시점: OAuth 완료 후 모달 + Settings에서 수정 가능
- 동기화: 전체 채널 (변경 없음)
- 검색: 선택된 채널만 필터링
- 신규 채널: 자동 포함 (빈 배열 = 전체)
- 채널 검색: 필터 포함 (50개+ 대응)

**Research Findings**:
- IPC 핸들러 이미 존재: `sync:get-slack-channels`, `sync:set-slack-channels`
- 데이터 모델 존재: `SlackChannelInfo { id, name, selected }`
- 버그 위치: `local-search.ts` 3곳 (280-287, 343-350, 393-400)

### Metis Review
**Identified Gaps** (addressed):
- 데이터 모델 선택 → 빈 배열 = 전체 포함으로 결정
- 기존 사용자 마이그레이션 → 빈 배열 = 전체로 자동 fix
- Modal Skip 동작 → 기본값(전체 선택) 사용

---

## Work Objectives

### Core Objective
Slack 채널 선택 UI를 추가하여 검색 범위를 사용자가 제어할 수 있게 함

### Concrete Deliverables
- `local-search.ts` 버그 수정 (빈 배열 시 Slack 제외 → 포함)
- `settings.html`에 채널 선택 UI 추가
- OAuth 완료 후 채널 선택 모달 추가
- i18n 번역 키 추가

### Definition of Done
- [ ] Slack 연결 후 Settings에서 채널 목록 표시됨
- [ ] 채널 체크/해제가 저장되고 검색에 반영됨
- [ ] OAuth 완료 후 채널 선택 모달이 표시됨
- [ ] `npm run pack:clean` 빌드 성공

### Must Have
- 채널 목록 표시 (공개 + 비공개)
- 개별 채널 토글
- 채널 검색 필터
- 전체 선택/해제 버튼
- 빈 배열 = 전체 포함 로직

### Must NOT Have (Guardrails)
- 동기화 로직 변경 (전체 동기화 유지)
- 채널 그룹핑/카테고리
- 채널 설명/멤버 수 상세 표시
- 실시간 채널 업데이트 (WebSocket)
- 채널별 동기화 설정
- 새 OAuth 스코프 추가

---

## Verification Strategy

> **UNIVERSAL RULE: ZERO HUMAN INTERVENTION**
>
> ALL tasks in this plan MUST be verifiable WITHOUT any human action.

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: NO (UI 작업, 수동 테스트)
- **Framework**: N/A

### Agent-Executed QA Scenarios (MANDATORY)

모든 Task에 Playwright 기반 QA 시나리오 포함

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start):
├── Task 1: Fix search logic bug (필수 선행)
└── Task 4: i18n translation (UI 작업 전 번역 키 필요)

Wave 2 (After Wave 1):
└── Task 2: Settings UI - channel selector (번역 키 사용)

Wave 3 (After Task 2):
└── Task 3: OAuth modal for channel selection (renderChannelList 재사용)
```

### Dependency Matrix

| Task | Depends On | Blocks | Can Parallelize With |
|------|------------|--------|---------------------|
| 1 | None | 2, 3 | 4 |
| 4 | None | 2, 3 | 1 |
| 2 | 1, 4 | 3 | None |
| 3 | 2 | None | None |

---

## TODOs

- [ ] 1. Fix search logic - 빈 배열 시 Slack 포함

  **What to do**:
  - `local-search.ts`의 3곳에서 빈 배열 처리 로직 수정
  - Line 279-287: `vectorSearch()` 함수 내부 (hybridSearch에서 호출됨)
  - Line 343-350: `ftsSearch()` 함수 내부
  - Line 393-400: `likeSearch()` 함수 내부
  - 현재: `selectedChannels.length === 0` → `source_type != 'slack'` (제외)
  - 변경: `selectedChannels.length === 0` → 조건 없음 (전체 포함)
  - `selectedChannels.length > 0`일 때만 필터링 적용
  - **주의**: `hybridSearch`는 상위 함수로, 실제 필터링은 하위 함수들에서 수행됨

  **Must NOT do**:
  - 동기화 로직 (`slack-sync.ts`) 수정
  - 다른 소스 (Notion, Gmail) 로직 변경

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: 단순 조건문 수정, 3곳 동일 패턴
  - **Skills**: []
    - 특별한 스킬 불필요 (간단한 코드 수정)

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (Sequential - 선행 작업)
  - **Blocks**: Tasks 2, 3, 4
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/services/local-search.ts:279-287` - 현재 버그 있는 vectorSearch 필터링 로직
  - `src/services/local-search.ts:343-350` - ftsSearch 동일 패턴
  - `src/services/local-search.ts:393-400` - likeSearch 동일 패턴

  **API/Type References**:
  - `src/services/settings-store.ts:getSelectedSlackChannels()` - 채널 목록 조회 함수
  - `src/services/settings-store.ts:SlackChannelInfo` - 채널 정보 인터페이스

  **Acceptance Criteria**:

  - [ ] `local-search.ts` 3곳 모두 수정됨
  - [ ] 빈 배열일 때 `source_type != 'slack'` 조건 없음
  - [ ] 선택된 채널 있을 때만 필터링 적용
  - [ ] TypeScript 컴파일 에러 없음: `npm run build`

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Build succeeds after fix
    Tool: Bash
    Preconditions: Code modified
    Steps:
      1. npm run build
      2. Assert: exit code 0
      3. Assert: no TypeScript errors in output
    Expected Result: Build completes without errors
    Evidence: Build output captured
  ```

  **Commit**: YES
  - Message: `fix(search): include Slack results when no channels selected`
  - Files: `src/services/local-search.ts`

---

- [ ] 2. Settings UI - 채널 선택 섹션 추가

  **What to do**:
  - `settings.html`에 Slack 채널 선택 UI 추가
  - Slack row 아래에 확장 가능한 채널 목록 섹션
  - 채널 검색 필터 input
  - 전체 선택/해제 버튼
  - 개별 채널 체크박스
  - 저장 시 `ipcRenderer.invoke('sync:set-slack-channels', channels)` 호출
  - 로드 시 `ipcRenderer.invoke('sync:get-slack-channels')` + `ipcRenderer.invoke('slack-channels')` 조합
  - **중요**: `renderChannelList(container, channels, options)` 함수로 추상화하여 Task 3 모달에서 재사용 가능하게 구현

  **UI 구조**:
  ```html
  <div id="slackChannelSelector" style="display: none;">
    <div class="channel-selector-header">
      <input type="text" placeholder="Search channels..." />
      <button>Select All</button>
      <button>Deselect All</button>
    </div>
    <div class="channel-list">
      <!-- 채널 체크박스 목록 (renderChannelList 함수로 렌더링) -->
    </div>
  </div>
  ```

  **함수 추상화 (Task 3 재사용용)**:
  ```javascript
  // 채널 목록 렌더링 함수 - Settings와 Modal에서 공유
  function renderChannelList(container, channels, selectedIds, options = {}) {
    // container: DOM element to render into
    // channels: 전체 채널 배열
    // selectedIds: 선택된 채널 ID Set
    // options: { onToggle, onSelectAll, onDeselectAll, searchFilter }
  }
  ```

  **Must NOT do**:
  - 채널 그룹핑 (공개/비공개 분리)
  - 채널 설명이나 멤버 수 표시
  - 새 IPC 핸들러 추가 (기존 것 사용)
  - 인라인 하드코딩 (반드시 함수 추상화)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI 컴포넌트 구현, HTML/CSS/JS 작업
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: Settings 페이지 스타일과 일관된 UI 구현 필요

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 (After Wave 1)
  - **Blocks**: Task 3
  - **Blocked By**: Task 1, Task 4 (번역 키 필요)

  **References**:

  **Pattern References**:
  - `src/renderer/settings.html:716-738` - Slack row UI 구조 (여기 아래에 추가)
  - `src/renderer/settings.html:731-737` - 드롭다운 메뉴 패턴
  - `src/renderer/settings.html:1314-1356` - updateSlackUI() 함수

  **API/Type References**:
  - `src/main/ipc-handlers.ts:786-791` - 기존 IPC 핸들러 (`sync:get-slack-channels`, `sync:set-slack-channels`)
  - `src/main/ipc-handlers.ts:443-447` - `slack-channels` 핸들러 (채널 목록 조회)
  - `src/services/slack-client.ts:20-26` - SlackChannel 인터페이스

  **Test References**:
  - 없음 (UI 작업)

  **Acceptance Criteria**:

  - [ ] Slack 연결 시 채널 목록 표시됨
  - [ ] 채널 검색 필터 동작
  - [ ] 전체 선택/해제 버튼 동작
  - [ ] 개별 체크박스 토글 동작
  - [ ] 변경 사항 저장됨 (새로고침 후 유지)
  - [ ] TypeScript 컴파일 성공

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Channel selector visible when Slack connected
    Tool: Playwright (playwright skill)
    Preconditions: App packaged with npm run pack:clean, Slack already connected
    Steps:
      1. Launch app: open 'release/mac-arm64/Linear Capture.app'
      2. Open Settings window (Cmd+,)
      3. Wait for: #slackRow visible (timeout: 5s)
      4. Assert: Channel selector section is visible below Slack row
      5. Assert: Channel list contains at least 1 channel
      6. Screenshot: .sisyphus/evidence/task-2-channel-selector.png
    Expected Result: Channel selector UI visible with channels
    Evidence: .sisyphus/evidence/task-2-channel-selector.png

  Scenario: Channel search filter works
    Tool: Playwright (playwright skill)
    Preconditions: Settings open, Slack connected
    Steps:
      1. Type "general" in channel search input
      2. Assert: Only channels containing "general" are visible
      3. Clear search input
      4. Assert: All channels visible again
    Expected Result: Search filters channel list
    Evidence: Screenshot captured

  Scenario: Select/Deselect All buttons work
    Tool: Playwright (playwright skill)
    Preconditions: Settings open, channel selector visible
    Steps:
      1. Click "Deselect All" button
      2. Assert: All checkboxes unchecked
      3. Click "Select All" button
      4. Assert: All checkboxes checked
    Expected Result: Bulk selection works
    Evidence: Screenshot captured

  Scenario: Channel selection persists after reload
    Tool: Playwright (playwright skill)
    Preconditions: Settings open, channels visible
    Steps:
      1. Uncheck first channel
      2. Close Settings window
      3. Reopen Settings window
      4. Assert: First channel still unchecked
    Expected Result: Selection saved to settings store
    Evidence: Screenshot captured
  ```

  **Commit**: YES
  - Message: `feat(settings): add Slack channel selector UI`
  - Files: `src/renderer/settings.html`

---

- [ ] 3. OAuth 완료 후 채널 선택 모달 추가

  **What to do**:
  - `settings.html`에 채널 선택 모달 HTML/CSS 추가
  - `slack-connected` 이벤트 수신 시 모달 표시 (1360-1368줄 수정)
  - **Task 2에서 만든 `renderChannelList()` 함수 호출**하여 모달 내부에 채널 목록 렌더링
  - "Save" 버튼: 선택 저장 후 모달 닫기
  - "Skip" 버튼 또는 X: 기본값(전체 선택) 사용, 모달 닫기
  - 모달 외부 클릭 시 Skip과 동일하게 처리

  **함수 재사용 예시**:
  ```javascript
  // slack-connected 이벤트 핸들러에서
  ipcRenderer.on('slack-connected', async (_event, result) => {
    // ... 기존 로직 ...
    const channels = await ipcRenderer.invoke('slack-channels');
    showChannelSelectionModal(channels.channels || []);
  });

  function showChannelSelectionModal(channels) {
    const modal = document.getElementById('channelSelectionModal');
    const container = modal.querySelector('.modal-channel-list');
    renderChannelList(container, channels, new Set(), {
      onToggle: (channelId, selected) => { ... },
      onSelectAll: () => { ... },
      onDeselectAll: () => { ... }
    });
    modal.style.display = 'flex';
  }
  ```

  **Must NOT do**:
  - 선택 필수로 만들기 (Skip 허용)
  - 새 IPC 핸들러 추가
  - 별도 파일로 분리 (settings.html 내에 구현)
  - 채널 목록 로직 중복 구현 (반드시 renderChannelList 재사용)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: 모달 UI 구현, 기존 컴포넌트 재사용
  - **Skills**: [`frontend-ui-ux`]
    - `frontend-ui-ux`: 모달 UX 패턴, 애니메이션

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (Final)
  - **Blocks**: None
  - **Blocked By**: Task 2

  **References**:

  **Pattern References**:
  - `src/renderer/settings.html:1360-1374` - `slack-connected` 이벤트 핸들러 (여기서 모달 트리거)
  - `src/renderer/index.html` - 기존 모달 패턴 참고 (있다면)

  **API/Type References**:
  - `src/main/oauth-handlers.ts:24-42` - OAuth 콜백 후 `slack-connected` 이벤트 발송
  - `src/services/slack-client.ts:20-26` - SlackChannel 인터페이스

  **Acceptance Criteria**:

  - [ ] OAuth 완료 후 모달 자동 표시
  - [ ] 모달에 채널 목록 표시 (Task 2 컴포넌트 재사용)
  - [ ] "Save" 클릭 시 선택 저장 + 모달 닫힘
  - [ ] "Skip" 또는 X 클릭 시 기본값(전체) + 모달 닫힘
  - [ ] 모달 외부 클릭 시 Skip과 동일

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Modal appears after OAuth complete
    Tool: Playwright (playwright skill)
    Preconditions: Slack not connected, app running
    Steps:
      1. Open Settings
      2. Click Slack "Connect" button
      3. Complete OAuth flow in opened browser
      4. Wait for: Modal visible (timeout: 30s)
      5. Assert: Modal title contains "Select Channels" or similar
      6. Assert: Channel list is populated
      7. Screenshot: .sisyphus/evidence/task-3-oauth-modal.png
    Expected Result: Channel selection modal appears
    Evidence: .sisyphus/evidence/task-3-oauth-modal.png

  Scenario: Save button saves selection and closes modal
    Tool: Playwright (playwright skill)
    Preconditions: OAuth modal open
    Steps:
      1. Uncheck 2 channels
      2. Click "Save" button
      3. Assert: Modal closes
      4. Open channel selector in Settings
      5. Assert: Same 2 channels are unchecked
    Expected Result: Selection persisted correctly
    Evidence: Screenshot captured

  Scenario: Skip button uses default (all selected)
    Tool: Playwright (playwright skill)
    Preconditions: OAuth modal open
    Steps:
      1. Click "Skip" or X button
      2. Assert: Modal closes
      3. Open channel selector in Settings
      4. Assert: All channels are checked
    Expected Result: Default selection applied
    Evidence: Screenshot captured
  ```

  **Commit**: YES
  - Message: `feat(settings): add channel selection modal after OAuth`
  - Files: `src/renderer/settings.html`

---

- [ ] 4. i18n 번역 키 추가

  **What to do**:
  - `locales/en/translation.json`에 새 번역 키 추가:
    - `slack.channels`: "Channels"
    - `slack.selectChannels`: "Select Channels"
    - `slack.searchChannels`: "Search channels..."
    - `slack.selectAll`: "Select All"
    - `slack.deselectAll`: "Deselect All"
    - `slack.channelsSelected`: "{{count}} channels selected"
    - `slack.noChannels`: "No channels found"
    - `slack.save`: "Save"
    - `slack.skip`: "Skip"
  - `npm run translate` 실행하여 다른 언어 자동 번역
  - `npm run validate:i18n` 실행하여 검증

  **Must NOT do**:
  - 직접 다른 언어 파일 수정 (translate 스크립트 사용)
  - 기존 키 수정

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: JSON 파일 수정 + 스크립트 실행
  - **Skills**: []
    - 특별한 스킬 불필요

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1)
  - **Parallel Group**: Wave 1 (UI 작업 전 번역 키 필요)
  - **Blocks**: Tasks 2, 3
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `locales/en/translation.json` - 기존 번역 키 패턴 참고
  - `locales/ko/translation.json` - 한국어 번역 예시

  **Documentation References**:
  - `CLAUDE.md:i18n 자동 번역` - 번역 워크플로우 설명

  **Acceptance Criteria**:

  - [ ] 영어 번역 키 추가됨
  - [ ] `npm run translate` 성공
  - [ ] `npm run validate:i18n` 통과
  - [ ] 한국어(ko) 번역 생성됨

  **Agent-Executed QA Scenarios**:

  ```
  Scenario: Translation script succeeds
    Tool: Bash
    Preconditions: English keys added
    Steps:
      1. npm run translate
      2. Assert: exit code 0
      3. npm run validate:i18n
      4. Assert: exit code 0
    Expected Result: All translations valid
    Evidence: Command output captured

  Scenario: Korean translation exists
    Tool: Bash
    Preconditions: translate script completed
    Steps:
      1. cat locales/ko/translation.json | grep "slack.channels"
      2. Assert: Key exists with Korean value
    Expected Result: Korean translation present
    Evidence: grep output captured
  ```

  **Commit**: YES
  - Message: `chore(i18n): add Slack channel selector translations`
  - Files: `locales/en/translation.json`, `locales/ko/translation.json`, `locales/de/translation.json`, `locales/fr/translation.json`, `locales/es/translation.json`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `fix(search): include Slack results when no channels selected` | local-search.ts | npm run build |
| 2 | `feat(settings): add Slack channel selector UI` | settings.html | npm run pack:clean |
| 3 | `feat(settings): add channel selection modal after OAuth` | settings.html | npm run pack:clean |
| 4 | `chore(i18n): add Slack channel selector translations` | locales/*.json | npm run validate:i18n |

---

## Success Criteria

### Verification Commands
```bash
npm run build         # TypeScript 컴파일 성공
npm run validate:i18n # 번역 검증 통과
npm run pack:clean    # 패키징 성공 + 앱 실행
```

### Final Checklist
- [ ] Slack 연결 후 채널 목록이 Settings에 표시됨
- [ ] 채널 검색 필터 동작
- [ ] 전체 선택/해제 버튼 동작
- [ ] OAuth 완료 후 채널 선택 모달 표시
- [ ] 선택 변경이 검색 결과에 반영됨
- [ ] 빈 배열(기본값) 시 모든 Slack 결과 포함
- [ ] 모든 번역 키 존재
