# F06. UI 개선 (완료)

Linear Capture 앱의 UI/UX 개선 작업 기록.

---

## 1. Null Reference 에러 수정

### 문제
```
Uncaught TypeError: Cannot read properties of null (reading 'addEventListener')
```
- HTML에서 `#contextSection`, `#aiRecommendSection` 제거 후 관련 JS 코드가 남아 null 참조 에러 발생

### 해결
- `document.getElementById()` 반환값을 null 체크하여 조건부 실행
- `// (LEGACY - removed)` 주석으로 레거시 코드 블록을 `if` 문으로 감쌈

---

## 2. Related Context 통합 패널

### 개요
3개의 분리된 컨텍스트 검색 UI를 하나의 "Related Context" 패널로 통합.

### 기존 문제

| 기존 섹션 | 역할 | 문제 |
|-----------|------|------|
| `#contextSection` | Slack/Notion/Gmail 수동 검색 | 역할 불명확 |
| `#aiRecommendSection` | Title 기반 자동 추천 | 결과 안 나오는 경우 많음 |
| `#semanticSearchSection` | Description 기반 시맨틱 검색 | 3개 영역의 구분이 혼란 |

### 해결: 통합 Related Context 패널
- **검색창 = 필터 개념**: 자동 추천/검색 구분 제거
- **Title-검색창 연동**: Title 입력 시 검색창에 자동 복사 + 검색 실행 (300ms debounce, 3자 이상)
- **새 IPC**: `context.getRelated` → `Promise.allSettled`로 Slack, AI 추천, Semantic(Slack/Notion) 병렬 호출
- **중복 제거**: URL 기준 deduplication
- **체크박스 선택 + Insert**: 다중 선택 후 Description에 마크다운 삽입

### 구현 구조
1. **Backend**: `context.getRelated` IPC 핸들러 (기존 서비스 병렬 호출 + 정규화)
2. **Frontend HTML/CSS**: `#relatedContextSection` (접기/펼치기, 검색, 결과 카드, 소스 뱃지)
3. **Frontend JS**: Title 연동, debounce 검색, 결과 렌더링, 선택/삽입
4. **Cleanup**: 기존 3개 섹션 HTML/JS 제거
5. **i18n**: `relatedContext.*` 키 9개 추가 (5개 언어)

---

## 3. User Hint (사용자 힌트 텍스트)

### 개요
캡처 이미지에 복합적 내용이 있을 때, 사용자가 선택적으로 힌트를 입력하면 AI가 해당 포인트에 집중하여 이슈를 생성.

### 데이터 흐름
```
UI (textarea) → IPC (reanalyze) → Analyzer (instruction 필드) → Worker → AI Prompt
```

### 구현 범위

| 계층 | 파일 | 변경 |
|------|------|------|
| Worker 타입 | `linear-capture-worker/src/prompts/types.ts` | `PromptContext.instruction?: string` |
| Worker 프롬프트 | `linear-capture-worker/src/prompts/issue-prompt.ts` | instruction 있으면 "사용자 요청" 섹션 추가 |
| Worker 분석 | `linear-capture-worker/src/index.ts` | `AnalysisRequest.instruction` 전달 |
| App 서비스 | `src/services/anthropic-analyzer.ts`, `gemini-analyzer.ts` | `AnalysisContext.instruction` + callWorker body 포함 |
| App IPC | `src/main/index.ts` | reanalyze 핸들러에서 `data.instruction` 추출 |
| App UI | `src/renderer/index.html` | 갤러리 아래 textarea (placeholder: "집중할 내용을 입력하세요") |

### 핵심 원칙
- 빈 힌트 = 기존 동작 (`.trim()` 후 빈 문자열이면 생략)
- 힌트 저장/히스토리 없음
- 이미지별 개별 힌트 없음
- TDD: Vitest 인프라 설정 + 단위 테스트

---

## 4. Settings: Validate & Save 버튼 통합

### 개요
설정 화면의 Linear API 토큰 검증/저장을 2-step에서 1-step으로 간소화.

### 변경 전후

| 항목 | Before | After |
|------|--------|-------|
| UX | "Validate" 클릭 → "Save" 활성화 → "Save" 클릭 | "Validate & Save" 1번 클릭 |
| 피드백 | 단계별 분리 | "Validating..." → "Saving..." → "Saved!" 순차 표시 |
| 저장 후 | 수동 새로고침 필요 | `loadSyncStatus()` 직접 호출 → Linear Sync 버튼 자동 활성화 |

### 주요 변경
- `saveBtn` HTML 요소 + 변수 + 클릭 핸들러 전체 제거
- `validateBtn` 핸들러에 save 로직 병합
- 상태 함수(`showPending/showValidating/showSuccess/showError`)에서 `saveBtn` 참조 제거
- Enter 키 핸들러 단순화
- 이미 저장된 토큰 로드 시 버튼 비활성화, 토큰 수정 시 다시 활성화
- `common.validateAndSave` i18n 키 추가 (기존 `common.validate`, `common.save` 유지)

---

## 5. 동기화 카운트 라벨 변경

### 문제
모든 서비스가 `123 docs`로 표시됨.

### 해결
`formatDocCount(count, unit)` 함수에 `unit` 파라미터 추가.

| 서비스 | 변경 전 | 변경 후 |
|--------|---------|---------|
| Slack | 123 docs | 123 messages |
| Notion | 123 docs | 123 docs (유지) |
| Linear | 123 docs | 123 issues |
| Gmail | 123 docs | 123 emails |

---

## 6. Sync Status 표시 + Linear 로고

### 문제 1: Sync Status
- 앱 재시작 시 항상 "동기화 준비 완료" 표시 (이전 동기화 이력 무시)
- **원인**: `getSyncStatus()`가 `sync_cursors` 테이블을 조회하지 않음
- **구조 불일치**: UI가 `.sources.slack.lastSync` 기대하지만 서비스가 `.slack.documentCount` 반환

### 해결 1
- `getSyncStatus()`에서 `sync_cursors` 테이블 LEFT JOIN으로 `last_synced_at` 조회
- 반환 구조를 `{ sources: {...} }`로 래핑
- `last_synced_at`을 epoch 밀리초로 변환 (null이면 undefined)

### 문제 2: Linear 로고
- `settings.html`이 화살표 스타일 SVG 사용 (잘못된 로고)

### 해결 2
- `settings.html` + `index.html` 모두 공식 Linear 로고 SVG로 교체
- 브랜드 컬러 `#5E6AD2`, path `M2.886 4.18A11.982...`

---

## 관련 파일 요약

| 파일 | 역할 |
|------|------|
| `src/renderer/index.html` | Related Context 패널, User Hint textarea |
| `src/renderer/settings.html` | Validate&Save 통합, 카운트 라벨, Sync Status, Linear 로고 |
| `src/main/index.ts` | `context.getRelated` IPC, reanalyze instruction 전달 |
| `src/services/local-search.ts` | `getSyncStatus()` 수정 (sync_cursors JOIN) |
| `src/services/anthropic-analyzer.ts` | instruction 필드 추가 |
| `src/services/gemini-analyzer.ts` | instruction 필드 추가 |
| `linear-capture-worker/src/prompts/issue-prompt.ts` | instruction 프롬프트 포함 |
| `locales/*/translation.json` | relatedContext.*, common.validateAndSave 키 |
