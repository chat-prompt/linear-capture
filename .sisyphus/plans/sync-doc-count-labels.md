# Settings: 서비스별 동기화 카운트 라벨 변경

## TL;DR

> **Quick Summary**: Integration 섹션의 싱크 카운트가 모두 "docs"로 표시되는 것을 서비스별 적절한 단위로 변경
> 
> **Deliverables**: `settings.html` 내 `formatDocCount` 함수 + 호출부 4곳 수정
> 
> **Estimated Effort**: Quick (5분)
> **Parallel Execution**: NO

---

## Context

현재 모든 서비스가 `123 docs`로 표시됨. 서비스별 의미가 다르므로 구분 필요.

| 서비스 | 현재 | 변경 후 |
|--------|------|---------|
| Slack | 123 docs | 123 messages |
| Notion | 123 docs | 123 docs (유지) |
| Linear | 123 docs | 123 issues |
| Gmail | 123 docs | 123 emails |

---

## TODOs

- [ ] 1. `formatDocCount` 함수 수정 + 호출부 변경

  **What to do**:

  **1-A. 함수 시그니처 변경** (~line 2083):
  ```javascript
  function formatDocCount(count, unit = 'docs') {
    if (!count) return '';
    return `${count.toLocaleString()} ${unit}`;
  }
  ```

  **1-B. 호출부 4곳 수정**:
  - Slack (~line 2101): `formatDocCount(src?.documentCount, 'messages')`
  - Notion (~line 2111): `formatDocCount(src?.documentCount)` — 기본값 유지
  - Linear (~line 2124): `formatDocCount(src?.documentCount, 'issues')`
  - Gmail (~line 2141): `formatDocCount(src?.documentCount, 'emails')`

  **Must NOT do**:
  - i18n 키 추가 불필요 (UI에 직접 표시되는 단위이므로 영어 고정 OK)
  - 다른 로직 변경 금지

  **References**:
  - `src/renderer/settings.html:2083-2086` — formatDocCount 함수
  - `src/renderer/settings.html:2101,2111,2124,2141` — 호출부 4곳

  **Acceptance Criteria**:
  - [ ] `npm run build` 성공
  - [ ] grep "formatDocCount" → 5곳 (함수 1 + 호출 4)

  **Commit**: `fix(settings): use service-specific labels for sync doc counts`
