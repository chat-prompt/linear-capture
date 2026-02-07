# Draft: UI Improvement - 연동/동기화 통합 및 컨텍스트 UX 개선

## Requirements (confirmed)

### 1. 연동 설명 추가 ✅
- 현재: Slack, Notion, Gmail 연동 버튼만 있고 "왜" 연동해야 하는지 설명 없음
- 결정: 섹션 상단에 한 줄 소개 추가
  - "이슈 작성 시 관련 대화/문서를 자동 찾아주는 AI 검색에 사용됩니다"

### 2. 연동/동기화 통합 ✅
- 현재: `Integrations` 섹션과 `Data Sync` 섹션이 분리됨
- 결정: **인라인 확장 방식**
  - 연동 전: `[Slack 아이콘] Slack` + `[연동]` 버튼
  - 연동 후: `[Slack ✓] workspace명` + `[동기화]` 버튼 + `[⋮]` 메뉴
  - ⋮ 메뉴 내용: 워크스페이스 변경, 연결 해제

### 3. OpenAI API Key 안내 ✅
- 결정: 기능 중심 설명 (별도 섹션 유지)
  - "이슈 작성 시 관련 대화/문서를 자동 찾아주는 AI 검색에 사용됩니다"

### 4. 메인 UI 컨텍스트 표현 개선 ✅
- 현재: "🔗 관련 컨텍스트"
- 결정: **"📎 Slack/Notion/Gmail에서 관련 내용 찾기"**
  - 연동 안 된 경우: "설정에서 연동 후 사용 가능합니다" 안내 표시

## Technical Decisions

### UI 패턴: 인라인 확장 방식
```
[미연동 상태]
┌─────────────────────────────────────────────┐
│ 🔗 Slack                          [연동하기] │
└─────────────────────────────────────────────┘

[연동 완료 상태]
┌─────────────────────────────────────────────┐
│ ✓ Slack · GPTers Workspace    [동기화] [⋮] │
│   마지막 동기화: 5분 전 · 1,234개 문서       │
└─────────────────────────────────────────────┘
```

### 섹션 통합
- 기존: Integrations 섹션 + Data Sync 섹션 (분리)
- 변경: **"서비스 연동"** 단일 섹션으로 통합
- OpenAI Key: 별도 "AI 검색 설정" 섹션으로 분리

## Research Findings
- Settings UI: `src/renderer/settings.html`
  - Integrations Section: line 602-641 (Slack, Notion, Gmail)
  - Data Sync Section: line 643-703 (OpenAI key + sync buttons)
  - JavaScript: 각 서비스별 connect/disconnect/sync 로직 (line 1198+)
- Main UI: `src/renderer/index.html`
  - Related Context Section: line 1413-1468
  - 현재 제목: "🔗 Related Context" with badge
- i18n: `locales/*/translation.json` 수정 필요

## Open Questions
1. ⋮ 메뉴의 정확한 옵션 목록? (워크스페이스 변경, 연결 해제, 기타?)
2. 동기화 진행 중 UI 표시 방식?

## Scope Boundaries
- INCLUDE:
  - settings.html UI 재구성
  - index.html 컨텍스트 섹션 제목/안내 변경
  - i18n 번역 키 추가/수정
- EXCLUDE:
  - 백엔드 로직 변경 (동기화/검색 로직)
  - 새로운 서비스 추가
