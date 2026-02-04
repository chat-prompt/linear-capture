# Context Sync - 시맨틱 검색 + 지표 수집

---

## 🚀 현재 진행 상황 (2025-02-02 Updated)

| Phase | 상태 | 설명 |
|-------|------|------|
| **Phase 0** | ✅ 완료 | Worker `/search`, `/track` 엔드포인트 구현 완료 |
| **Phase 1** | ✅ 완료 | 앱 서비스 레이어 (semantic-search, analytics, adapters) |
| **Phase 1.5** | ✅ 완료 | 통합 연동 + 테스트 수정 + 검증 완료 (2025-02-02) |
| **Phase 2** | 🔄 진행중 | IPC 핸들러 완료, UI 작업 대기 (2025-02-02) |

### 🔄 Phase 2 진행 중 (2025-02-02 22:07)

| 항목 | 상태 | 비고 |
|------|------|------|
| 2-2 IPC 핸들러 | ✅ 완료 | `context-semantic-search` 추가 |
| 2-1 UI 통합 | ⏳ 대기 | **파일 분리 방식으로 계획 업데이트됨** |
| `npm test` | ✅ 37 tests, 0 failures | |
| `npm run build` | ✅ 성공 | |

**2-1 파일 구조 (NEW)**:
```
src/renderer/
├── semantic-search.css   # 시맨틱 검색 스타일
├── semantic-search.js    # 시맨틱 검색 로직
└── index.html            # import 추가 + HTML 섹션 추가
```

---

### ✅ Phase 1.5 검증 완료 (2025-02-02 21:53)

| 검증 항목 | 결과 | 비고 |
|----------|------|------|
| `npm test` | ✅ 37 tests, 0 failures | i18n 테스트 수정 완료 |
| `npm run build` | ✅ No errors | TypeScript 컴파일 성공 |
| `npm run pack:clean` | ✅ 앱 정상 실행 | release/mac-arm64/Linear Capture.app 생성 |
| Worker 연동 | ✅ `[ANALYTICS] app_open` 확인 | wrangler tail로 로그 검증 완료 |

### 생성된 파일

```
linear-capture-worker/
├── src/analytics/track.ts        # POST /track - 지표 수집
├── src/search/stateless.ts       # POST /search - Stateless 시맨틱 검색
└── src/index.ts                  # 라우트 추가

linear-capture/
├── src/types/context-search.ts   # ContextItem, ContextAdapter, TrackRequest 등
├── src/services/
│   ├── semantic-search.ts        # Worker /search 호출 래퍼
│   ├── analytics.ts              # Worker /track 호출 래퍼
│   └── context-adapters/
│       ├── index.ts              # 어댑터 팩토리
│       └── slack-adapter.ts      # SlackMessage → ContextItem 변환
```

---

## TL;DR

> **Quick Summary**: Linear Capture에서 이슈 생성 시 Slack/Notion/Gmail에서 **시맨틱 검색**으로 관련 문서를 찾고, AI 요약과 함께 이슈에 연동. **Stateless 아키텍처**로 유저 데이터 저장 없이 보안 유지. 사용 지표 수집 추가.
> 
> **Deliverables**:
> - Worker: `/search` (시맨틱 검색), `/track` (지표 수집) 엔드포인트
> - 공통 Context Search 인터페이스 (Slack/Notion/Gmail 확장 가능)
> - OpenAI Embedding 기반 시맨틱 검색 (Stateless - DB 저장 없음)
> - 통합된 "관련 문서 연동" UI
> - 지표 수집 (app_open, issue_created)
> 
> **Estimated Effort**: Medium (4-5시간)
> **Parallel Execution**: YES - Phase 0 tasks parallel
> **Critical Path**: Phase 0 → Phase 1 → **Phase 1.5** → Phase 2

---

## Context

### Original Request
- 검색 추천 정확도를 높이기 (fuzzy → semantic)
- Context Search를 본문 작성 쪽에 통합하여 직관적인 UI
- 자동 검색과 수동 검색 모두 지원
- 검색 결과에 AI 요약 포함
- Slack부터 시작, Notion/Gmail 확장 가능 구조
- **이슈 생성 지표 수집**

### Technical Discussion Summary

**검색 방식 결정**:
| 옵션 | 월 비용 | 검색 품질 | 결정 |
|------|--------|----------|------|
| Fuse.js | $0 | ⭐⭐ (키워드) | ❌ 품질 한계 |
| pgvector + OpenAI | $10-30 | ⭐⭐⭐⭐⭐ | ❌ 보안 우려 |
| **OpenAI Embedding (Stateless)** | ~$0.15 | ⭐⭐⭐⭐⭐ | ✅ 선택 |

**보안 결정**:
- 유저 Slack 대화를 우리 DB에 저장하면 민감함
- **Stateless 방식**: 매번 가져와서 임베딩 → 검색 → 결과 반환 → 휘발
- DB 없음, 저장 없음

**지표 수집**:
- 이미 deviceId 생성/전송 구조 있음
- `/track` 엔드포인트 추가로 이벤트 수집

### Research Findings
- 기존 백엔드 완료: `slack-client.ts`, `notion-client.ts`, `gmail-client.ts`
- deviceId 생성/저장 이미 있음 (`src/main/index.ts`)
- Worker로 deviceId 전송 이미 됨

---

## Work Objectives

### Core Objective
1. **시맨틱 검색**: "로그인 문제" 검색 → "인증 오류", "세션 만료" 관련 문서도 찾음
2. **보안 유지**: 유저 데이터 저장 없음 (Stateless)
3. **지표 수집**: 이슈 생성 횟수, 앱 사용량 추적

### Concrete Deliverables

```
Worker (linear-capture-ai):
├── /search     # 시맨틱 검색 (NEW)
└── /track      # 지표 수집 (NEW)

App (linear-capture):
├── src/
│   ├── types/
│   │   └── context-search.ts       # 공통 타입
│   ├── services/
│   │   ├── semantic-search.ts      # Worker /search 호출
│   │   ├── analytics.ts            # Worker /track 호출
│   │   └── context-adapters/
│   │       ├── index.ts            # 어댑터 팩토리
│   │       └── slack-adapter.ts    # Slack → ContextItem
│   ├── renderer/
│   │   └── index.html              # 통합 UI
│   └── main/
│       └── index.ts                # IPC + 이벤트 전송
```

### Definition of Done
- [ ] `npm run build` 성공
- [ ] `npm test` 모든 테스트 통과 (0 failures)
- [ ] `npm run pack:clean` 후 앱 실행
- [ ] Slack 시맨틱 검색 동작 ("로그인" → "인증" 관련도 찾음)
- [ ] 이슈 생성 시 `/track` 호출 확인 (Worker 로그)

### Must Have
- Worker `/search` 엔드포인트 (OpenAI Embedding)
- Worker `/track` 엔드포인트 (이벤트 로깅)
- Stateless 아키텍처 (DB 저장 없음)
- 공통 `ContextItem` 인터페이스
- Slack 시맨틱 검색 동작
- `issue_created` 이벤트 전송

### Must NOT Have (Guardrails)
- 유저 대화 내용 저장 (DB, 로그 등 어디에도)
- 검색 쿼리 내용 저장
- 기존 `*-client.ts` 파일 수정 (어댑터로 래핑)
- Notion/Gmail 실제 구현 (구조만)

---

## Architecture

### Stateless 시맨틱 검색

```
┌─────────────────────────────────────────────────────────────────┐
│                    Linear Capture (Electron)                     │
│                                                                  │
│  "관련 문서 연동" 버튼 클릭                                        │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────────┐                                           │
│  │ Slack OAuth 토큰  │ ← 앱에 저장된 토큰                          │
│  └────────┬─────────┘                                           │
│           │                                                      │
└───────────┼──────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Cloudflare Worker (/search)                     │
│                                                                  │
│  1. Slack API 호출 (토큰으로) → 최근 메시지 가져옴                  │
│  2. OpenAI Embedding API → 메시지들 임베딩                        │
│  3. 쿼리 임베딩 → 코사인 유사도 계산                               │
│  4. 상위 결과 반환                                                │
│                                                                  │
│  ❌ 저장 없음 (모든 데이터 휘발)                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 지표 수집

```
┌─────────────────────────────────────────────────────────────────┐
│                    Linear Capture (Electron)                     │
│                                                                  │
│  앱 실행 시 ──────────────────────┐                              │
│  이슈 생성 성공 시 ────────────────┼─── POST /track              │
│                                   │    { event, deviceId }       │
└───────────────────────────────────┼──────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Cloudflare Worker (/track)                      │
│                                                                  │
│  Cloudflare Analytics / D1에 저장                                │
│                                                                  │
│  저장하는 것:                                                     │
│  - event: 'app_open' | 'issue_created'                          │
│  - deviceId: 익명 ID                                             │
│  - timestamp                                                     │
│  - metadata: { imageCount, hasContext }                         │
│                                                                  │
│  ❌ 저장 안 하는 것:                                              │
│  - 이슈 내용, 대화 내용, 검색 쿼리                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **User wants tests**: YES
- **Framework**: vitest

### Phase별 검증 체크리스트

각 Phase 완료 후 다음 Phase로 넘어가기 전 **반드시 아래 검증을 통과해야 함**.

| Phase | Gate 조건 | 검증 명령어 |
|-------|----------|------------|
| Phase 0 | Worker 엔드포인트 정상 응답 | `curl` 테스트 |
| Phase 1 | 빌드 성공 | `npm run build` |
| **Phase 1.5** | **테스트 전체 통과 + 통합 동작** | `npm test` (0 failures) + `pack:clean` |
| Phase 2 | UI 동작 + Worker 로그 확인 | `npm run pack:clean` + `wrangler tail` |

### Worker 테스트

```bash
# /search 테스트
curl -X POST https://linear-capture-ai.ny-4f1.workers.dev/search \
  -H "Content-Type: application/json" \
  -d '{"query": "로그인 문제", "items": [{"id":"1","content":"인증 오류 발생","source":"slack"},{"id":"2","content":"날씨가 좋다","source":"slack"}]}'

# /track 테스트  
curl -X POST https://linear-capture-ai.ny-4f1.workers.dev/track \
  -H "Content-Type: application/json" \
  -d '{"event": "issue_created", "deviceId": "test-device-123"}'
```

---

## TODOs

---

### Phase 0: Worker 엔드포인트 ✅ 완료 (2025-02-02)

**테스트 결과:**
```
/search 시맨틱 검색:
- "로그인이 안됩니다" → "인증 오류" 0.59, "비밀번호" 0.49, "날씨" 0.18 ✓
- "앱 오류 크래시 버그" → "크래시" 0.69, "동작 안함" 0.31, "점심" 0.21 ✓

/track 지표 수집:
- 정상 이벤트 → {"success": true} ✓
- 잘못된 이벤트 → 적절한 에러 반환 ✓
```

**생성된 파일:**
```
linear-capture-worker/
├── src/analytics/track.ts     # /track 엔드포인트
├── src/search/stateless.ts    # /search 엔드포인트 (Stateless OpenAI)
└── src/index.ts               # 라우트 추가

linear-capture/
└── src/types/context-search.ts  # 공통 타입 (ContextItem, ContextAdapter, etc.)
```

**Phase 0 Gate**: ✅ 통과
- [x] `/search` curl 테스트 성공
- [x] `/track` curl 테스트 성공

---

- [x] 0-1. Worker `/search` 엔드포인트

  **What to do**:
  - `POST /search` 엔드포인트 추가
  - 입력: `{ query, items: ContextItem[], limit? }`
  - 처리:
    1. 모든 메시지 + 쿼리를 OpenAI text-embedding-3-small로 임베딩
    2. 코사인 유사도 계산
    3. 상위 N개 반환
  - 출력: `{ success: true, results: SearchResult[] }` (score 포함)

  **Must NOT do**:
  - 메시지 내용 저장 (로그 포함)
  - 쿼리 내용 저장

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **References**:
  - `linear-capture-worker/src/index.ts` - 라우트 추가 위치
  - `linear-capture-worker/src/vectorize/embeddings.ts` - 기존 임베딩 패턴 참고
  - OpenAI Embedding API: https://platform.openai.com/docs/guides/embeddings

  **Acceptance Criteria**:
  ```bash
  curl -X POST https://linear-capture-ai.ny-4f1.workers.dev/search \
    -H "Content-Type: application/json" \
    -d '{"query": "로그인", "items": [{"id":"1","content":"인증 오류 발생","source":"slack"},{"id":"2","content":"날씨가 좋다","source":"slack"}]}'
  # Assert: results[0].content = "인증 오류 발생", score > 0.4
  ```

  **Commit**: YES (Worker 레포에)
  - Message: `feat(worker): add /search endpoint for semantic search`

---

- [x] 0-2. Worker `/track` 엔드포인트

  **What to do**:
  - `POST /track` 엔드포인트 추가
  - 입력: `{ event, deviceId, metadata? }`
  - 처리: Cloudflare KV에 저장 + 콘솔 로그
  - 이벤트 타입: `app_open`, `issue_created`, `search_used`, `context_linked`

  **Must NOT do**:
  - 이슈 내용, 검색 쿼리 저장

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with 0-1)

  **Acceptance Criteria**:
  ```bash
  curl -X POST https://linear-capture-ai.ny-4f1.workers.dev/track \
    -H "Content-Type: application/json" \
    -d '{"event": "issue_created", "deviceId": "test-device-123"}'
  # Assert: {"success": true}
  ```

  **Commit**: YES (Worker 레포에)
  - Message: `feat(worker): add /track endpoint for analytics`

---

- [x] 0-3. 공통 타입 정의

  **What to do**:
  - `src/types/context-search.ts` 생성
  - `ContextItem` 공통 타입 정의
  - `ContextAdapter` 인터페이스 정의
  - `SemanticSearchResult`, `TrackRequest` 타입 정의

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with 0-1, 0-2)

  **References**:
  - `src/services/slack-client.ts:36-54` - SlackMessage
  - `src/services/notion-client.ts:40-62` - NotionPage
  - `src/services/gmail-client.ts:24-41` - GmailMessage

  **Acceptance Criteria**:
  ```bash
  npm run build
  # Assert: No TypeScript errors
  ```

  **Commit**: YES
  - Message: `feat(types): add context search interfaces`
  - Files: `src/types/context-search.ts`

---

### Phase 1: 앱 서비스 레이어 ✅ 빌드 완료 (2025-02-02)

**생성된 파일:**
```
src/services/
├── semantic-search.ts           # Worker /search 호출 래퍼 (재시도 로직 포함)
├── analytics.ts                 # Worker /track 호출 래퍼
└── context-adapters/
    ├── index.ts                 # 어댑터 팩토리
    └── slack-adapter.ts         # SlackMessage → ContextItem 변환
```

**Phase 1 Gate**: ✅ 통과
- [x] `npm run build` 성공

---

- [x] 1-1. 시맨틱 검색 서비스

  **What to do**:
  - `src/services/semantic-search.ts` 생성
  - Worker `/search` 호출 래퍼
  - 입력: `query`, `ContextItem[]`
  - 출력: 점수 정렬된 `SearchResult[]`
  - 재시도 로직 (exponential backoff)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **References**:
  - `src/services/anthropic-analyzer.ts` - Worker 호출 패턴
  - `src/types/context-search.ts` - 타입 정의

  **Acceptance Criteria**:
  ```bash
  npm run build
  # Assert: No TypeScript errors
  ```

  **Commit**: YES
  - Message: `feat(search): add semantic search service`
  - Files: `src/services/semantic-search.ts`

---

- [x] 1-2. 지표 전송 서비스

  **What to do**:
  - `src/services/analytics.ts` 생성
  - Worker `/track` 호출 래퍼
  - `trackEvent(event, metadata?)` 함수
  - deviceId 자동 포함 (`getDeviceId()` 사용)
  - 헬퍼 함수: `trackAppOpen()`, `trackIssueCreated()`, `trackSearchUsed()`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **References**:
  - `src/services/settings-store.ts` - `getDeviceId()` 함수
  - `src/services/anthropic-analyzer.ts` - Worker 호출 패턴

  **Acceptance Criteria**:
  ```bash
  npm run build
  # Assert: No errors
  ```

  **Commit**: YES
  - Message: `feat(analytics): add event tracking service`
  - Files: `src/services/analytics.ts`

---

- [x] 1-3. Slack 어댑터 구현

  **What to do**:
  - `src/services/context-adapters/index.ts` - 어댑터 팩토리
  - `src/services/context-adapters/slack-adapter.ts`
    - `SlackMessage` → `ContextItem` 변환
    - 기존 `slack-client.ts` 래핑 (수정 X)
    - `fetchItems(query)`: Slack API 호출 → ContextItem[] 반환

  **Must NOT do**:
  - 기존 `slack-client.ts` 수정

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **References**:
  - `src/services/slack-client.ts` - 기존 Slack 서비스 (searchMessages)
  - `src/types/context-search.ts` - ContextAdapter 인터페이스

  **Acceptance Criteria**:
  ```bash
  npm run build
  # Assert: No TypeScript errors
  ```

  **Commit**: YES
  - Message: `feat(adapters): add Slack adapter for context search`
  - Files: `src/services/context-adapters/*.ts`

---

### Phase 1.5: 통합 연동 + 테스트 수정 ✅ 완료 (2025-02-02)

> Phase 1에서 생성된 서비스들이 실제로 동작하는지 확인하고, 기존 테스트 실패를 수정했습니다.

**Phase 1.5 Gate 조건**: ✅ 모두 통과
- [x] `npm test` - 모든 테스트 통과 (37/37, 0 failures)
- [x] `npm run pack:clean` - 앱 정상 실행
- [x] Worker 로그에 `app_open` 이벤트 확인

---

- [x] 1.5-1. Analytics 연동 (main/index.ts)

  **What to do**:
  - `src/main/index.ts`에 analytics import 추가
  - 앱 실행 시 `trackAppOpen()` 호출
  - 이슈 생성 성공 시 `trackIssueCreated()` 호출

  **구현 위치**:
  ```typescript
  // src/main/index.ts 상단에 추가
  import { trackAppOpen, trackIssueCreated } from '../services/analytics';
  
  // app.on('ready') 또는 app.whenReady() 내부에 추가
  trackAppOpen();
  
  // create-issue IPC 핸들러 성공 시 추가
  trackIssueCreated(images.length, hasContext);
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **References**:
  - `src/main/index.ts` - 앱 초기화 및 IPC 핸들러 위치
  - `src/services/analytics.ts` - trackAppOpen, trackIssueCreated 함수

  **Acceptance Criteria**:
  ```bash
  # 1. 빌드
  npm run build
  
  # 2. 패키징 후 앱 실행
  npm run pack:clean
  
  # 3. 다른 터미널에서 Worker 로그 모니터링
  cd ../linear-capture-worker && wrangler tail --format=pretty
  
  # 4. 앱 실행 직후 Worker 로그에서 확인
  # [ANALYTICS] app_open | device=xxxxxxxx | metadata={} 출력되면 성공
  
  # 5. 이슈 생성 후 Worker 로그에서 확인
  # [ANALYTICS] issue_created | device=xxxxxxxx | metadata={"imageCount":1} 출력되면 성공
  ```

  **Commit**: YES
  - Message: `feat(analytics): integrate tracking in main process`
  - Files: `src/main/index.ts`

---

- [x] 1.5-2. 기존 테스트 수정 (i18n-settings.test.ts)

  **What to do**:
  - `src/__tests__/i18n-settings.test.ts` 수정
  - 지원 언어가 2개(en, ko)에서 5개(en, ko, de, fr, es)로 늘어난 것 반영

  **수정 내용**:
  ```typescript
  // 기존 (잘못됨)
  expect(langs).toHaveLength(2);
  
  // 수정 후
  expect(langs).toHaveLength(5);
  expect(langs).toContain('de');
  expect(langs).toContain('fr');
  expect(langs).toContain('es');
  ```

  ```typescript
  // 기존 (잘못됨) - fr은 이제 지원됨
  setLanguage('fr');
  expect(mockStoreInstance.set).not.toHaveBeenCalled();
  
  // 수정 후 - 다른 미지원 언어로 테스트
  setLanguage('ja'); // 일본어는 미지원
  expect(mockStoreInstance.set).not.toHaveBeenCalled();
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **References**:
  - `src/__tests__/i18n-settings.test.ts` - 수정 대상
  - `src/services/settings-store.ts` - `getSupportedLanguages()` 함수

  **Acceptance Criteria**:
  ```bash
  npm test src/__tests__/i18n-settings.test.ts
  # Assert: 5 tests, 0 failures
  
  npm test
  # Assert: 37 tests, 0 failures
  ```

  **Commit**: YES
  - Message: `test(i18n): update tests for 5 supported languages`
  - Files: `src/__tests__/i18n-settings.test.ts`

---

- [x] 1.5-3. Phase 0-1 작업물 커밋

  **What to do**:
  - 현재 untracked 상태인 모든 파일 커밋
  - 계획에 명시된 커밋 메시지 사용

  **커밋 순서**:
  ```bash
  # 1. 타입 정의
  git add src/types/context-search.ts
  git commit -m "feat(types): add context search interfaces"
  
  # 2. 서비스 레이어
  git add src/services/semantic-search.ts
  git commit -m "feat(search): add semantic search service"
  
  git add src/services/analytics.ts
  git commit -m "feat(analytics): add event tracking service"
  
  git add src/services/context-adapters/
  git commit -m "feat(adapters): add Slack adapter for context search"
  
  # 3. 테스트 수정 (1.5-2 완료 후)
  git add src/__tests__/i18n-settings.test.ts
  git commit -m "test(i18n): update tests for 5 supported languages"
  
  # 4. Analytics 연동 (1.5-1 완료 후)
  git add src/main/index.ts
  git commit -m "feat(analytics): integrate tracking in main process"
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [`git-master`]

  **Acceptance Criteria**:
  ```bash
  git status
  # Assert: nothing to commit, working tree clean (또는 .sisyphus/plans만 남음)
  
  git log --oneline -6
  # Assert: 위 커밋들이 순서대로 표시됨
  ```

---

- [ ] 1.5-4. (선택) 단위 테스트 추가

  > 이 작업은 선택사항입니다. Phase 2에서 통합 테스트로 대체 가능.

  **What to do**:
  - `src/__tests__/semantic-search.test.ts` 생성
  - `src/__tests__/slack-adapter.test.ts` 생성
  - Worker 호출 mocking

  **Recommended Agent Profile**:
  - **Category**: `unspecified-low`
  - **Skills**: []

  **References**:
  - `src/__tests__/analyzer.test.ts` - 기존 테스트 패턴
  - `vitest.config.ts` - 테스트 설정

  **Acceptance Criteria**:
  ```bash
  npm test src/__tests__/semantic-search.test.ts
  npm test src/__tests__/slack-adapter.test.ts
  # Assert: All tests pass
  ```

  **Commit**: YES
  - Message: `test(search): add semantic search and adapter tests`

---

### Phase 1.5 완료 체크리스트 ✅ ALL PASS

| 항목 | 명령어 | 결과 |
|------|--------|------|
| 빌드 성공 | `npm run build` | ✅ No errors |
| **테스트 전체 통과** | `npm test` | ✅ 37 tests, 0 failures |
| 앱 실행 | `npm run pack:clean` | ✅ 앱 정상 실행 |
| **app_open 이벤트** | `wrangler tail` | ✅ `[ANALYTICS] app_open | device=11019f68` 확인 |

**✅ Phase 2 진행 가능**

---

### Phase 2: UI 통합 + 이벤트 연동 (1.5시간)

**Phase 2 전제조건**:
- [x] Phase 1.5 Gate 통과
- [x] `npm test` 0 failures
- [x] `trackAppOpen()` Worker 로그 확인됨

---

- [ ] 2-1. "관련 문서 연동" UI (파일 분리 방식)

  > **중요**: index.html이 3368줄로 매우 크므로, 새 기능은 별도 파일로 분리하여 추가합니다.

  **생성할 파일**:
  ```
  src/renderer/
  ├── semantic-search.css   # NEW: 시맨틱 검색 UI 스타일
  └── semantic-search.js    # NEW: 시맨틱 검색 로직
  ```

  **수정할 파일**:
  - `src/renderer/index.html` - CSS/JS import 추가 + HTML 섹션 추가 (최소 수정)

  ---

  **Step 2-1-A: `semantic-search.css` 생성**

  시맨틱 검색 UI 스타일. 기존 `.context-section` 패턴 참고.

  ```css
  /* 포함할 클래스 */
  .semantic-search-section { /* 메인 컨테이너 */ }
  .semantic-search-header { /* 접기/펼치기 헤더 */ }
  .semantic-search-body { /* 본문 영역 */ }
  .semantic-search-row { /* 검색 입력 행 */ }
  .semantic-results { /* 결과 목록 */ }
  .semantic-result-item { /* 개별 결과 */ }
  .semantic-result-source.slack/notion/gmail { /* 소스 뱃지 */ }
  .semantic-result-score { /* 점수 표시 */ }
  .semantic-insert-btn { /* 삽입 버튼 */ }
  ```

  ---

  **Step 2-1-B: `semantic-search.js` 생성**

  시맨틱 검색 로직. IPC 호출 + UI 동작.

  ```javascript
  // 주요 함수
  function initSemanticSearch() { /* 초기화 */ }
  function toggleSemanticSection() { /* 접기/펼치기 */ }
  async function performSemanticSearch(query) { 
    // ipcRenderer.invoke('context-semantic-search', { query, source: 'slack' })
  }
  function renderSemanticResults(results) { /* 결과 렌더링 */ }
  function insertSelectedToDescription() { /* Description에 삽입 */ }
  
  // 이벤트 바인딩
  // - Title blur → 자동 검색 (debounced 500ms)
  // - 수동 검색 버튼 클릭
  // - 결과 항목 체크박스 토글
  // - 삽입 버튼 클릭
  ```

  **IPC 호출 예시**:
  ```javascript
  const result = await ipcRenderer.invoke('context-semantic-search', { 
    query: titleInput.value, 
    source: 'slack' 
  });
  // result: { success: boolean, results: SearchResult[], error?: string }
  // SearchResult: { id, content, title?, url?, source, score, metadata? }
  ```

  ---

  **Step 2-1-C: `index.html` 수정 (최소 변경)**

  1. **CSS import 추가** (head 태그 끝, `</style>` 다음):
     ```html
     <link rel="stylesheet" href="semantic-search.css">
     ```

  2. **HTML 섹션 추가** (Description 필드 다음, `</div><!-- form-group -->` 다음 ~1360줄):
     ```html
     <!-- Semantic Search Section -->
     <div id="semanticSearchSection" class="semantic-search-section">
       <div class="semantic-search-header" id="semanticSearchHeader">
         <div class="semantic-search-header-left">
           <span class="semantic-search-header-icon">🔗</span>
           <span class="semantic-search-header-title" data-i18n="semantic.title">Related Documents</span>
           <span class="semantic-search-header-badge" id="semanticBadge" style="display: none;">0</span>
         </div>
         <span class="semantic-search-header-toggle">▼</span>
       </div>
       <div class="semantic-search-body">
         <div class="semantic-auto-status" id="semanticAutoStatus">
           <span>💡</span>
           <span data-i18n="semantic.autoHint">Enter a title to auto-search related documents</span>
         </div>
         <div class="semantic-search-row">
           <input type="text" class="semantic-search-input" id="semanticSearchInput" 
                  data-i18n-placeholder="semantic.searchPlaceholder" placeholder="Search related documents...">
           <button type="button" class="semantic-search-btn" id="semanticSearchBtn" data-i18n="common.search">Search</button>
         </div>
         <div id="semanticLoading" class="semantic-loading" style="display: none;">
           <div class="spinner"></div>
           <span data-i18n="semantic.searching">Searching...</span>
         </div>
         <div id="semanticResults" class="semantic-results"></div>
         <div id="semanticEmpty" class="semantic-empty" style="display: none;" data-i18n="semantic.noResults">No related documents found</div>
         <div class="semantic-actions" id="semanticActions" style="display: none;">
           <span class="semantic-selected-count" id="semanticSelectedCount">0 selected</span>
           <button type="button" class="semantic-insert-btn" id="semanticInsertBtn">
             <span>📎</span>
             <span data-i18n="semantic.insertToDescription">Insert to Description</span>
           </button>
         </div>
       </div>
     </div>
     ```

  3. **JS import 추가** (`</script>` 직전, 파일 끝):
     ```html
     </script>
     <script src="semantic-search.js"></script>
     </body>
     ```

  ---

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]

  **References**:
  - `src/renderer/index.html:758-1014` - 기존 `.context-*` CSS 스타일 패턴
  - `src/renderer/index.html:1236-1330` - 기존 Context Search HTML 구조
  - `src/renderer/index.html:1357-1360` - Description 필드 위치 (HTML 삽입 지점)
  - `src/types/context-search.ts` - SearchResult 타입 정의
  - `src/main/index.ts:1090-1101` - IPC 핸들러 (`context-semantic-search`)

  **Acceptance Criteria**:
  ```bash
  # 1. 빌드 성공 확인
  npm run build
  # Assert: No errors
  
  # 2. 파일 존재 확인
  ls src/renderer/semantic-search.css src/renderer/semantic-search.js
  # Assert: 두 파일 모두 존재
  
  # 3. 앱 실행 테스트
  npm run pack:clean
  # Manual verification:
  # - "🔗 Related Documents" 섹션 표시됨
  # - 섹션 클릭 시 접기/펼치기 동작
  # - Title 입력 후 blur → 자동 검색 실행
  # - 검색 결과에 소스 뱃지 + 점수 표시
  # - 체크박스 선택 → "Insert" 버튼 활성화
  # - Insert 클릭 → Description에 마크다운 삽입
  ```

  **Commit**: YES (3개 파일)
  - Message: `feat(ui): add semantic search UI with file separation`
  - Files: 
    - `src/renderer/semantic-search.css`
    - `src/renderer/semantic-search.js`
    - `src/renderer/index.html`

---

- [x] 2-2. IPC 핸들러 (시맨틱 검색) ✅ 완료 (2025-02-02)

  **What to do**:
  - `context-semantic-search` IPC 핸들러 추가
  - 렌더러에서 호출 → Slack 어댑터 → 시맨틱 검색 서비스 → 결과 반환

  **구현 완료**:
  ```typescript
  // src/main/index.ts에 추가됨
  ipcMain.handle('context-semantic-search', async (_event, { query, source }: { query: string; source: string }) => {
    try {
      const adapter = getAdapter(source as ContextSource);
      const items = await adapter.fetchItems(query);
      const searchService = getSemanticSearchService();
      const results = await searchService.search(query, items);
      return { success: true, results };
    } catch (error) {
      console.error('Context semantic search error:', error);
      return { success: false, error: String(error), results: [] };
    }
  });
  ```

  **검증 결과**:
  - [x] `npm run build` 성공
  - [x] `npm test` 37 tests, 0 failures

  **Commit**: 대기 (UI 작업과 함께 커밋 예정)

---

## Commit Strategy

| Phase | After Task | Message | Files |
|-------|------------|---------|-------|
| 0 | 0-3 | `feat(types): add context search interfaces` | `src/types/context-search.ts` |
| 1 | 1-1 | `feat(search): add semantic search service` | `src/services/semantic-search.ts` |
| 1 | 1-2 | `feat(analytics): add event tracking service` | `src/services/analytics.ts` |
| 1 | 1-3 | `feat(adapters): add Slack adapter for context search` | `src/services/context-adapters/*` |
| **1.5** | 1.5-1 | `feat(analytics): integrate tracking in main process` | `src/main/index.ts` |
| **1.5** | 1.5-2 | `test(i18n): update tests for 5 supported languages` | `src/__tests__/i18n-settings.test.ts` |
| 2 | 2-1 | `feat(ui): add semantic search UI with file separation` | `src/renderer/semantic-search.css`, `semantic-search.js`, `index.html` |
| 2 | 2-2 | `feat(ipc): add semantic search handler` | `src/main/index.ts` |

---

## Cost Estimation

### 시맨틱 검색 (OpenAI Embedding)

```
검색 1회당:
- 메시지 50개 × 평균 100 토큰 = 5,000 토큰
- 쿼리 1개 × 20 토큰 = 20 토큰
- 총 ~5,000 토큰 × $0.00002/토큰 = $0.0001

월 1,000회 검색 = $0.10
```

### 지표 수집

```
Cloudflare KV: 무료 티어 충분 (1,000,000 reads/day, 1,000 writes/day)
```

**총 예상 비용: ~$0.15/월**

---

## Success Criteria

### Verification Commands
```bash
npm run build        # No errors
npm test             # All tests pass (0 failures)
npm run pack:clean   # App works
```

### Final Checklist
- [ ] Worker `/search` 동작 (시맨틱 검색)
- [ ] Worker `/track` 동작 (이벤트 수집)
- [ ] "로그인" 검색 → "인증", "세션" 관련 메시지도 찾음
- [ ] 앱 실행 시 `app_open` 이벤트 전송됨 (Worker 로그)
- [ ] 이슈 생성 시 `issue_created` 이벤트 전송됨 (Worker 로그)
- [ ] 유저 대화 내용 저장 없음 (Stateless)
- [ ] 기존 기능 정상 동작
- [ ] `npm test` 모든 테스트 통과

---

## Security Checklist

| 항목 | 저장 여부 | 비고 |
|------|----------|------|
| Slack 메시지 내용 | ❌ | Worker 메모리에서 처리 후 휘발 |
| 검색 쿼리 | ❌ | 저장 안 함 |
| 이슈 제목/설명 | ❌ | 저장 안 함 |
| deviceId | ✅ | 익명 ID (앞 8자만), 개인정보 아님 |
| 이벤트 타입 | ✅ | 'issue_created' 등 문자열만 |
| 이미지 개수 | ✅ | 숫자만 (내용 아님) |

---

## Future: Notion/Gmail 확장 (별도 플랜)

어댑터 구조가 준비되면, 확장은 간단:

```typescript
// notion-adapter.ts
export class NotionAdapter implements ContextAdapter {
  async search(query: string): Promise<ContextItem[]> {
    const pages = await notionService.searchPages(query);
    const items = pages.map(this.toContextItem);
    return semanticSearch.search(query, items);
  }
}
```

UI 변경 없이 어댑터만 추가하면 됨.
