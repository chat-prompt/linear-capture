# Slack 채널 필터링 버그 수정 + UI 정리

## TL;DR

> **Quick Summary**: 검색 시 채널 선택 필터링이 동작하지 않는 버그 수정 + Settings UI 공간 최적화
> 
> **Deliverables**:
> - `local-search.ts` 필터링 로직 수정 (3곳)
> - Settings UI 채널 선택 섹션 축소/접기 처리
> 
> **Estimated Effort**: Quick (30분)
> **Parallel Execution**: YES - 2 tasks 병렬
> **Critical Path**: Task 1 + Task 2 (병렬)

---

## Context

### 문제 1: 검색 필터링 버그

**현재 코드 (버그)**:
```javascript
// local-search.ts:280-285
const selectedChannels = getSelectedSlackChannels();  // 전체 채널 목록 [{id, name, selected}, ...]
if (selectedChannels.length > 0) {
  const channelIds = selectedChannels.map(ch => ch.id);  // ❌ 모든 채널 ID (selected 무시)
  // ...
}
```

**문제**: `getSelectedSlackChannels()`는 전체 채널 목록을 반환하는데, `selected` 플래그를 무시하고 모든 채널 ID로 필터링함.

**수정 필요**:
```javascript
const allChannels = getSelectedSlackChannels();
const selectedIds = allChannels.filter(ch => ch.selected).map(ch => ch.id);  // ✅ selected:true만

if (allChannels.length === 0) {
  // 설정 없음 → 전체 Slack 포함 (opt-out 기본값)
} else if (selectedIds.length > 0) {
  // 일부 선택됨 → 선택된 채널만 포함
  params.push(JSON.stringify(selectedIds));
  conditions.push(`(source_type != 'slack' OR metadata->>'channelId' = ANY(...))`);
} else {
  // 모두 선택 해제됨 → Slack 제외
  conditions.push(`source_type != 'slack'`);
}
```

### 문제 2: Settings UI 공간

채널 선택 섹션이 항상 펼쳐져 있어 Settings 화면의 많은 공간을 차지함.
→ 접기/펼치기(Collapsible) 처리 필요

---

## Work Objectives

### Core Objective
1. 채널 선택이 검색 결과에 실제로 반영되도록 버그 수정
2. Settings UI에서 채널 선택 섹션을 접을 수 있게 개선

### Must Have
- `selected: false`인 채널이 검색 결과에서 제외됨
- 모든 채널 선택 해제 시 Slack 결과 전체 제외
- 채널 섹션 기본 접힘 상태 (연결됨 표시만)

### Must NOT Have
- 동기화 로직 변경 (전체 동기화 유지)
- 새 IPC 핸들러 추가

---

## TODOs

- [ ] 1. Fix search filtering logic - `selected` 플래그 반영

  **What to do**:
  - `local-search.ts`의 3곳 수정 (vectorSearch, ftsSearch, likeSearch)
  - 현재: `selectedChannels.map(ch => ch.id)` (모든 채널)
  - 변경: `allChannels.filter(ch => ch.selected).map(ch => ch.id)` (선택된 채널만)
  - Edge case 처리:
    - `allChannels.length === 0` → 설정 없음 → 전체 포함
    - `selectedIds.length > 0` → 선택된 채널만 포함
    - `selectedIds.length === 0 && allChannels.length > 0` → 모두 해제 → Slack 제외

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/services/local-search.ts:279-287` - vectorSearch 필터링
  - `src/services/local-search.ts:343-351` - ftsSearch 필터링
  - `src/services/local-search.ts:393-401` - likeSearch 필터링
  - `src/services/settings-store.ts:197-199` - getSelectedSlackChannels() 반환값 확인

  **Acceptance Criteria**:
  - [ ] 채널 선택 해제 시 해당 채널 메시지가 검색 결과에서 제외됨
  - [ ] 모든 채널 선택 해제 시 Slack 결과 전체 제외
  - [ ] 설정 없는 경우 (빈 배열) 전체 Slack 포함
  - [ ] `npm run build` 성공

  **Commit**: YES
  - Message: `fix(search): filter by selected channels only`
  - Files: `src/services/local-search.ts`

---

- [ ] 2. UI improvement - 채널 선택 섹션 접기/펼치기

  **What to do**:
  - `settings.html`의 채널 선택 섹션을 collapsible로 변경
  - 기본 상태: 접힘 (연결 상태 + 선택된 채널 수만 표시)
  - 펼침 시: 검색, 전체선택/해제, 채널 목록 표시
  - 토글 버튼 또는 섹션 헤더 클릭으로 펼치기

  **UI 구조**:
  ```html
  <!-- Slack row 아래 -->
  <div id="slackChannelSelector" class="channel-selector collapsed">
    <div class="channel-selector-header" onclick="toggleChannelSelector()">
      <span>Channels</span>
      <span class="channel-summary">23/24 selected</span>
      <span class="toggle-icon">▼</span>
    </div>
    <div class="channel-selector-body">
      <!-- 기존 검색, 버튼, 목록 -->
    </div>
  </div>
  ```

  **CSS**:
  ```css
  .channel-selector.collapsed .channel-selector-body {
    display: none;
  }
  .channel-selector .toggle-icon {
    transition: transform 0.2s;
  }
  .channel-selector.collapsed .toggle-icon {
    transform: rotate(-90deg);
  }
  ```

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/renderer/settings.html` - 기존 채널 선택 섹션 (slackChannelSelector)

  **Acceptance Criteria**:
  - [ ] 채널 섹션 기본 접힘 상태
  - [ ] 헤더 클릭 시 펼치기/접기 토글
  - [ ] 접힌 상태에서 "N/M selected" 표시
  - [ ] `npm run build` 성공

  **Commit**: YES
  - Message: `feat(settings): make channel selector collapsible`
  - Files: `src/renderer/settings.html`

---

## Commit Strategy

| After Task | Message | Files | Verification |
|------------|---------|-------|--------------|
| 1 | `fix(search): filter by selected channels only` | local-search.ts | npm run build |
| 2 | `feat(settings): make channel selector collapsible` | settings.html | npm run pack:clean |

---

## Success Criteria

### Verification Commands
```bash
npm run build         # TypeScript 컴파일 성공
npm run pack:clean    # 패키징 + 앱 실행
```

### Final Checklist
- [ ] 채널 선택 해제 후 검색 시 해당 채널 메시지 제외
- [ ] Settings에서 채널 섹션 접기/펼치기 동작
- [ ] 접힌 상태에서 선택된 채널 수 표시
